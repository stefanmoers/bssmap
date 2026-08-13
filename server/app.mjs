import { createReadStream } from "node:fs";
import { access, mkdir, readFile, stat, unlink } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Busboy from "busboy";
import sharp from "sharp";
import { openDatabase } from "./database.mjs";
import { createToken, hashToken, verifyPassword } from "./security.mjs";

const MAX_JSON_BYTES = 64 * 1024;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
const SESSION_COOKIE = "bssmap_session";
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/i;
const OBJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PUBLIC_FILES = new Set([
  "/",
  "/index.html",
  "/styles.css",
  "/viewer.js",
  "/planner.js",
  "/planning-calculations.js"
]);
const PUBLIC_DIRECTORIES = ["/data/", "/images/", "/maps/", "/vendor/"];

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".dzi", "application/xml; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".txt", "text/plain; charset=utf-8"]
]);

const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors *",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff"
};

const sendJson = (response, statusCode, value, headers = {}) => {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    ...securityHeaders,
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(body);
};

const sendError = (response, statusCode, message) => {
  sendJson(response, statusCode, { error: message });
};

const readJson = async (request) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) {
      const error = new Error("Die Anfrage ist zu groß.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    const error = new Error("Ungültige JSON-Anfrage.");
    error.statusCode = 400;
    throw error;
  }
};

const parseCookies = (request) => Object.fromEntries(
  String(request.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      if (separator < 0) {
        return [part, ""];
      }
      const encodedValue = part.slice(separator + 1);
      try {
        return [part.slice(0, separator), decodeURIComponent(encodedValue)];
      } catch {
        return [part.slice(0, separator), ""];
      }
    })
);

const sessionCookie = (sessionId, secureCookie) => {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`
  ];
  if (secureCookie) {
    parts.push("Secure");
  }
  return parts.join("; ");
};

const clearSessionCookie = (secureCookie) => {
  const parts = [
    `${SESSION_COOKIE}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0"
  ];
  if (secureCookie) {
    parts.push("Secure");
  }
  return parts.join("; ");
};

const sameOrigin = (request, configuredOrigin) => {
  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }
  if (configuredOrigin) {
    return origin === configuredOrigin;
  }
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
};

const requestSession = (database, request) => {
  const sessionId = parseCookies(request)[SESSION_COOKIE];
  if (!sessionId) {
    return null;
  }
  const now = Date.now();
  const storedSessionId = hashToken(sessionId);
  const session = database.prepare(`
    SELECT sessions.id AS sessionId, sessions.csrf_token AS csrfToken,
           sessions.expires_at AS expiresAt, users.id AS userId,
           users.username, users.role
      FROM sessions
      JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = ? AND sessions.expires_at > ? AND users.enabled = 1
  `).get(storedSessionId, now);
  if (!session) {
    database.prepare("DELETE FROM sessions WHERE id = ?").run(storedSessionId);
    return null;
  }
  return session;
};

const requireEditor = (database, request, response, configuredOrigin) => {
  if (!sameOrigin(request, configuredOrigin)) {
    sendError(response, 403, "Die Anfrage stammt nicht von dieser Anwendung.");
    return null;
  }
  const session = requestSession(database, request);
  if (!session) {
    sendError(response, 401, "Bitte zuerst anmelden.");
    return null;
  }
  if (!["editor", "admin"].includes(session.role)) {
    sendError(response, 403, "Für diese Aktion fehlt die Berechtigung.");
    return null;
  }
  if (request.headers["x-csrf-token"] !== session.csrfToken) {
    sendError(response, 403, "Die Sicherheitssitzung ist nicht mehr gültig.");
    return null;
  }
  return session;
};

const parsePhotoUpload = (request) => new Promise((resolve, reject) => {
  let parser;
  try {
    parser = Busboy({
      headers: request.headers,
      limits: {
        fieldSize: 2000,
        fields: 2,
        fileSize: MAX_PHOTO_BYTES,
        files: 1,
        parts: 3
      }
    });
  } catch {
    reject(Object.assign(new Error("Der Upload muss multipart/form-data verwenden."), { statusCode: 400 }));
    return;
  }

  const fields = {};
  const chunks = [];
  let fileInfo = null;
  let truncated = false;
  let parseError = null;

  parser.on("field", (name, value) => {
    if (name === "alt" || name === "caption") {
      fields[name] = value;
    }
  });
  parser.on("file", (name, stream, info) => {
    if (name !== "photo" || fileInfo) {
      stream.resume();
      return;
    }
    fileInfo = info;
    stream.on("limit", () => {
      truncated = true;
    });
    stream.on("data", (chunk) => chunks.push(chunk));
  });
  parser.on("error", (error) => {
    parseError = error;
  });
  parser.on("close", () => {
    if (parseError) {
      reject(Object.assign(new Error("Der Upload konnte nicht gelesen werden."), { statusCode: 400 }));
    } else if (truncated) {
      reject(Object.assign(new Error("Das Foto darf höchstens 10 MB groß sein."), { statusCode: 413 }));
    } else if (!fileInfo || chunks.length === 0) {
      reject(Object.assign(new Error("Es wurde kein Foto ausgewählt."), { statusCode: 400 }));
    } else {
      resolve({ fields, fileInfo, buffer: Buffer.concat(chunks) });
    }
  });
  request.pipe(parser);
});

const photoUrl = (relativePath) => (
  `/uploads/${relativePath.split(path.sep).map(encodeURIComponent).join("/")}`
);

const publicPhoto = (row, session) => ({
  id: row.id,
  src: photoUrl(row.imagePath),
  thumbnailSrc: photoUrl(row.thumbnailPath),
  alt: row.altText,
  caption: row.caption,
  managed: true,
  canDelete: Boolean(session && (session.role === "admin" || session.userId === row.uploadedBy))
});

const contentResponse = (database, session) => {
  const result = {};
  const overrides = database.prepare(`
    SELECT object_id AS objectId, description, updated_at AS updatedAt
      FROM object_overrides
  `).all();
  for (const override of overrides) {
    result[override.objectId] = { description: override.description, photos: [] };
  }

  const photos = database.prepare(`
    SELECT id, object_id AS objectId, image_path AS imagePath,
           thumbnail_path AS thumbnailPath, alt_text AS altText,
           caption, uploaded_by AS uploadedBy
      FROM photos
     ORDER BY created_at, id
  `).all();
  for (const photo of photos) {
    result[photo.objectId] ??= { photos: [] };
    result[photo.objectId].photos ??= [];
    result[photo.objectId].photos.push(publicPhoto(photo, session));
  }
  return { objects: result };
};

const serveFile = async (response, absolutePath, requestMethod, cacheControl) => {
  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) {
    return false;
  }
  response.writeHead(200, {
    ...securityHeaders,
    "Cache-Control": cacheControl,
    "Content-Length": fileStat.size,
    "Content-Type": MIME_TYPES.get(path.extname(absolutePath).toLowerCase()) || "application/octet-stream"
  });
  if (requestMethod === "HEAD") {
    response.end();
  } else {
    createReadStream(absolutePath).pipe(response);
  }
  return true;
};

export const createBssMapServer = async ({
  rootDirectory = path.resolve("."),
  dataDirectory = path.resolve("var"),
  secureCookie = process.env.NODE_ENV === "production",
  publicOrigin = process.env.BSSMAP_PUBLIC_ORIGIN || ""
} = {}) => {
  const objectData = JSON.parse(await readFile(path.join(rootDirectory, "data/objects.json"), "utf8"));
  const objectIds = new Set(objectData.objects.map((object) => object.id));
  const database = openDatabase(dataDirectory);
  const photoDirectory = path.join(dataDirectory, "photos");
  await mkdir(photoDirectory, { recursive: true });

  const loginAttempts = new Map();
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://localhost");
      const pathname = decodeURIComponent(requestUrl.pathname);
      const method = request.method || "GET";

      if (pathname === "/runtime-config.json" && ["GET", "HEAD"].includes(method)) {
        sendJson(response, 200, { serverFeatures: true, apiBaseUrl: "/api" });
        return;
      }

      if (pathname === "/api/health" && method === "GET") {
        sendJson(response, 200, { status: "ok" });
        return;
      }

      if (pathname === "/api/session" && method === "GET") {
        const session = requestSession(database, request);
        sendJson(response, 200, session ? {
          authenticated: true,
          username: session.username,
          role: session.role,
          csrfToken: session.csrfToken
        } : { authenticated: false });
        return;
      }

      if (pathname === "/api/content" && method === "GET") {
        sendJson(response, 200, contentResponse(database, requestSession(database, request)));
        return;
      }

      if (pathname === "/api/login" && method === "POST") {
        if (!sameOrigin(request, publicOrigin)) {
          sendError(response, 403, "Die Anfrage stammt nicht von dieser Anwendung.");
          return;
        }
        const clientKey = request.socket.remoteAddress || "unknown";
        const now = Date.now();
        const recentAttempts = (loginAttempts.get(clientKey) || []).filter((time) => now - time < 15 * 60 * 1000);
        if (recentAttempts.length >= 8) {
          sendError(response, 429, "Zu viele Anmeldeversuche. Bitte später erneut versuchen.");
          return;
        }
        const body = await readJson(request);
        const username = String(body.username || "").trim();
        const password = String(body.password || "");
        const user = USERNAME_PATTERN.test(username)
          ? database.prepare("SELECT * FROM users WHERE username = ? AND enabled = 1").get(username)
          : null;
        const valid = Boolean(user && await verifyPassword(password, user.password_hash));
        if (!valid) {
          recentAttempts.push(now);
          loginAttempts.set(clientKey, recentAttempts);
          sendError(response, 401, "Benutzername oder Passwort ist falsch.");
          return;
        }
        loginAttempts.delete(clientKey);
        const sessionToken = createToken();
        const sessionId = hashToken(sessionToken);
        const csrfToken = createToken(24);
        database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
        database.prepare(`
          INSERT INTO sessions (id, user_id, csrf_token, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(sessionId, user.id, csrfToken, now, now + SESSION_MAX_AGE_SECONDS * 1000);
        sendJson(response, 200, {
          authenticated: true,
          username: user.username,
          role: user.role,
          csrfToken
        }, { "Set-Cookie": sessionCookie(sessionToken, secureCookie) });
        return;
      }

      if (pathname === "/api/logout" && method === "POST") {
        const session = requireEditor(database, request, response, publicOrigin);
        if (!session) {
          return;
        }
        database.prepare("DELETE FROM sessions WHERE id = ?").run(session.sessionId);
        sendJson(response, 200, { authenticated: false }, {
          "Set-Cookie": clearSessionCookie(secureCookie)
        });
        return;
      }

      const objectMatch = pathname.match(/^\/api\/objects\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
      if (objectMatch && method === "PATCH") {
        const session = requireEditor(database, request, response, publicOrigin);
        if (!session) {
          return;
        }
        const objectId = objectMatch[1];
        if (!objectIds.has(objectId)) {
          sendError(response, 404, "Das Tauchziel existiert nicht.");
          return;
        }
        const body = await readJson(request);
        if (typeof body.description !== "string") {
          sendError(response, 400, "Die Beschreibung fehlt.");
          return;
        }
        const description = body.description.trim();
        if (description.length > 4000) {
          sendError(response, 400, "Die Beschreibung darf höchstens 4.000 Zeichen lang sein.");
          return;
        }
        const updatedAt = new Date().toISOString();
        database.prepare(`
          INSERT INTO object_overrides (object_id, description, updated_by, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (object_id) DO UPDATE SET
            description = excluded.description,
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at
        `).run(objectId, description, session.userId, updatedAt);
        sendJson(response, 200, { objectId, description, updatedAt });
        return;
      }

      const uploadMatch = pathname.match(/^\/api\/objects\/([a-z0-9]+(?:-[a-z0-9]+)*)\/photos$/);
      if (uploadMatch && method === "POST") {
        const session = requireEditor(database, request, response, publicOrigin);
        if (!session) {
          return;
        }
        const objectId = uploadMatch[1];
        if (!objectIds.has(objectId)) {
          sendError(response, 404, "Das Tauchziel existiert nicht.");
          return;
        }
        const upload = await parsePhotoUpload(request);
        const alt = String(upload.fields.alt || "").trim();
        const caption = String(upload.fields.caption || "").trim();
        if (!alt || alt.length > 300 || caption.length > 1000) {
          sendError(response, 400, "Alternativtext fehlt oder Bildangaben sind zu lang.");
          return;
        }
        if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(upload.fileInfo.mimeType)) {
          sendError(response, 415, "Erlaubt sind JPEG-, PNG- und WebP-Dateien.");
          return;
        }

        let metadata;
        try {
          metadata = await sharp(upload.buffer, { limitInputPixels: 40_000_000 }).metadata();
        } catch {
          sendError(response, 415, "Die Datei ist kein lesbares Bild.");
          return;
        }
        if (!new Set(["jpeg", "png", "webp"]).has(metadata.format)) {
          sendError(response, 415, "Das tatsächliche Bildformat wird nicht unterstützt.");
          return;
        }

        const photoId = randomUUID();
        const objectDirectory = path.join(photoDirectory, objectId);
        const imagePath = path.join(objectId, `${photoId}.webp`);
        const thumbnailPath = path.join(objectId, `${photoId}-thumb.webp`);
        const absoluteImagePath = path.join(photoDirectory, imagePath);
        const absoluteThumbnailPath = path.join(photoDirectory, thumbnailPath);
        await mkdir(objectDirectory, { recursive: true });
        const source = sharp(upload.buffer, { limitInputPixels: 40_000_000 }).rotate();
        try {
          await Promise.all([
            source.clone().resize({
              width: 2000,
              height: 2000,
              fit: "inside",
              withoutEnlargement: true
            }).webp({ quality: 84 }).toFile(absoluteImagePath),
            source.clone().resize({
              width: 500,
              height: 500,
              fit: "inside",
              withoutEnlargement: true
            }).webp({ quality: 78 }).toFile(absoluteThumbnailPath)
          ]);
        } catch (error) {
          await Promise.allSettled([unlink(absoluteImagePath), unlink(absoluteThumbnailPath)]);
          throw error;
        }

        const createdAt = new Date().toISOString();
        try {
          database.prepare(`
            INSERT INTO photos (
              id, object_id, image_path, thumbnail_path, alt_text,
              caption, uploaded_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(photoId, objectId, imagePath, thumbnailPath, alt, caption, session.userId, createdAt);
        } catch (error) {
          await Promise.allSettled([
            unlink(absoluteImagePath),
            unlink(absoluteThumbnailPath)
          ]);
          throw error;
        }
        const row = {
          id: photoId,
          objectId,
          imagePath,
          thumbnailPath,
          altText: alt,
          caption,
          uploadedBy: session.userId
        };
        sendJson(response, 201, { objectId, photo: publicPhoto(row, session) });
        return;
      }

      const photoMatch = pathname.match(/^\/api\/photos\/([0-9a-f-]{36})$/i);
      if (photoMatch && method === "DELETE") {
        const session = requireEditor(database, request, response, publicOrigin);
        if (!session) {
          return;
        }
        const photo = database.prepare(`
          SELECT id, image_path AS imagePath, thumbnail_path AS thumbnailPath,
                 uploaded_by AS uploadedBy
            FROM photos WHERE id = ?
        `).get(photoMatch[1]);
        if (!photo) {
          sendError(response, 404, "Das Foto existiert nicht.");
          return;
        }
        if (session.role !== "admin" && session.userId !== photo.uploadedBy) {
          sendError(response, 403, "Dieses Foto darf nur vom Autor oder einem Admin gelöscht werden.");
          return;
        }
        database.prepare("DELETE FROM photos WHERE id = ?").run(photo.id);
        await Promise.allSettled([
          unlink(path.join(photoDirectory, photo.imagePath)),
          unlink(path.join(photoDirectory, photo.thumbnailPath))
        ]);
        sendJson(response, 200, { deleted: true });
        return;
      }

      if (pathname.startsWith("/uploads/") && ["GET", "HEAD"].includes(method)) {
        const relativePath = pathname.slice("/uploads/".length);
        const absolutePath = path.resolve(photoDirectory, relativePath);
        if (!absolutePath.startsWith(`${path.resolve(photoDirectory)}${path.sep}`)) {
          sendError(response, 404, "Datei nicht gefunden.");
          return;
        }
        if (await serveFile(response, absolutePath, method, "public, max-age=31536000, immutable")) {
          return;
        }
      }

      const isPublicPath = PUBLIC_FILES.has(pathname)
        || PUBLIC_DIRECTORIES.some((directory) => pathname.startsWith(directory));
      if (isPublicPath && ["GET", "HEAD"].includes(method)) {
        const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
        const absolutePath = path.resolve(rootDirectory, relativePath);
        const cacheControl = pathname.includes("/map_files/")
            || pathname.startsWith("/images/")
            || pathname.startsWith("/vendor/")
          ? "public, max-age=3600"
          : "no-cache";
        if (absolutePath.startsWith(`${path.resolve(rootDirectory)}${path.sep}`)
            && await serveFile(response, absolutePath, method, cacheControl)) {
          return;
        }
      }

      sendError(response, 404, "Nicht gefunden.");
    } catch (error) {
      if (error?.code === "ENOENT") {
        sendError(response, 404, "Nicht gefunden.");
        return;
      }
      console.error(error);
      sendError(response, error.statusCode || 500, error.statusCode ? error.message : "Interner Serverfehler.");
    }
  });

  return {
    database,
    server,
    close: async () => {
      if (server.listening) {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
      database.close();
    }
  };
};
