import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { createBssMapServer } from "../app.mjs";
import { hashPassword, verifyPassword } from "../security.mjs";

const projectRoot = path.resolve(".");

const startTestServer = async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "bssmap-server-test-"));
  const application = await createBssMapServer({
    rootDirectory: projectRoot,
    dataDirectory,
    secureCookie: false
  });
  await new Promise((resolve) => application.server.listen(0, "127.0.0.1", resolve));
  const address = application.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return { application, baseUrl, dataDirectory };
};

const createUser = async (database, username, password, role = "editor") => {
  database.prepare(`
    INSERT INTO users (username, password_hash, role, enabled, created_at)
    VALUES (?, ?, ?, 1, ?)
  `).run(username, await hashPassword(password), role, new Date().toISOString());
};

const login = async (baseUrl, username, password) => {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ username, password })
  });
  const body = await response.json();
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  return { response, body, cookie };
};

test("Passwörter werden mit Salt gehasht und sicher geprüft", async () => {
  const first = await hashPassword("ein-sehr-langes-testpasswort");
  const second = await hashPassword("ein-sehr-langes-testpasswort");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("ein-sehr-langes-testpasswort", first), true);
  assert.equal(await verifyPassword("falsch", first), false);
});

test("Die eingecheckte Laufzeitkonfiguration hält GitHub Pages statisch", async () => {
  const config = JSON.parse(await readFile(path.join(projectRoot, "runtime-config.json"), "utf8"));
  assert.deepEqual(config, { serverFeatures: false, apiBaseUrl: "" });
});

test("Servermodus bietet Authentifizierung, Beschreibungen und Bild-Uploads", async (context) => {
  const { application, baseUrl, dataDirectory } = await startTestServer();
  context.after(async () => {
    await application.close();
    await rm(dataDirectory, { recursive: true, force: true });
  });

  await createUser(application.database, "taucher", "sicheres-testpasswort", "editor");

  const configResponse = await fetch(`${baseUrl}/runtime-config.json`);
  assert.equal(configResponse.status, 200);
  assert.deepEqual(await configResponse.json(), { serverFeatures: true, apiBaseUrl: "/api" });

  const staticResponse = await fetch(`${baseUrl}/`);
  assert.equal(staticResponse.status, 200);
  assert.match(await staticResponse.text(), /Tauchplatzkarte Blausteinsee/);

  const unauthorized = await fetch(`${baseUrl}/api/objects/segelboot`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ description: "Nicht erlaubt" })
  });
  assert.equal(unauthorized.status, 401);

  const invalidLogin = await login(baseUrl, "taucher", "falsch");
  assert.equal(invalidLogin.response.status, 401);

  const authenticated = await login(baseUrl, "taucher", "sicheres-testpasswort");
  assert.equal(authenticated.response.status, 200);
  assert.equal(authenticated.body.authenticated, true);
  assert.ok(authenticated.cookie);
  assert.ok(authenticated.body.csrfToken);

  const sessionResponse = await fetch(`${baseUrl}/api/session`, {
    headers: { Cookie: authenticated.cookie }
  });
  assert.equal(sessionResponse.status, 200);
  assert.equal((await sessionResponse.json()).username, "taucher");

  const missingCsrf = await fetch(`${baseUrl}/api/objects/segelboot`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: authenticated.cookie,
      Origin: baseUrl
    },
    body: JSON.stringify({ description: "Ohne CSRF" })
  });
  assert.equal(missingCsrf.status, 403);

  const descriptionResponse = await fetch(`${baseUrl}/api/objects/segelboot`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: authenticated.cookie,
      Origin: baseUrl,
      "X-CSRF-Token": authenticated.body.csrfToken
    },
    body: JSON.stringify({ description: "Eine redaktionell ergänzte Beschreibung." })
  });
  assert.equal(descriptionResponse.status, 200);

  const invalidForm = new FormData();
  invalidForm.append("alt", "Kein echtes Bild");
  invalidForm.append("caption", "");
  invalidForm.append("photo", new Blob(["kein bild"], { type: "image/jpeg" }), "falsch.jpg");
  const invalidUpload = await fetch(`${baseUrl}/api/objects/segelboot/photos`, {
    method: "POST",
    headers: {
      Cookie: authenticated.cookie,
      Origin: baseUrl,
      "X-CSRF-Token": authenticated.body.csrfToken
    },
    body: invalidForm
  });
  assert.equal(invalidUpload.status, 415);

  const sourceImage = await sharp({
    create: {
      width: 900,
      height: 600,
      channels: 3,
      background: { r: 12, g: 70, b: 92 }
    }
  }).jpeg().toBuffer();
  const form = new FormData();
  form.append("alt", "Testfoto des Segelboots");
  form.append("caption", "Automatisch erzeugtes Testbild");
  form.append("photo", new Blob([sourceImage], { type: "image/jpeg" }), "test.jpg");

  const uploadResponse = await fetch(`${baseUrl}/api/objects/segelboot/photos`, {
    method: "POST",
    headers: {
      Cookie: authenticated.cookie,
      Origin: baseUrl,
      "X-CSRF-Token": authenticated.body.csrfToken
    },
    body: form
  });
  const uploadText = await uploadResponse.text();
  assert.equal(uploadResponse.status, 201, uploadText);
  const uploadBody = JSON.parse(uploadText);
  assert.equal(uploadBody.photo.alt, "Testfoto des Segelboots");
  assert.equal(uploadBody.photo.canDelete, true);

  const contentResponse = await fetch(`${baseUrl}/api/content`, {
    headers: { Cookie: authenticated.cookie }
  });
  const content = await contentResponse.json();
  assert.equal(content.objects.segelboot.description, "Eine redaktionell ergänzte Beschreibung.");
  assert.equal(content.objects.segelboot.photos.length, 1);

  const imageResponse = await fetch(`${baseUrl}${uploadBody.photo.src}`);
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("content-type"), "image/webp");
  const storedImage = Buffer.from(await imageResponse.arrayBuffer());
  const metadata = await sharp(storedImage).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 900);
  assert.equal(metadata.height, 600);
  assert.equal(metadata.exif, undefined);

  const storedRelativePath = uploadBody.photo.src.replace(/^\/uploads\//, "");
  assert.ok((await readFile(path.join(dataDirectory, "photos", storedRelativePath))).length > 0);

  const deleteResponse = await fetch(`${baseUrl}/api/photos/${uploadBody.photo.id}`, {
    method: "DELETE",
    headers: {
      Cookie: authenticated.cookie,
      Origin: baseUrl,
      "X-CSRF-Token": authenticated.body.csrfToken
    }
  });
  assert.equal(deleteResponse.status, 200);

  const contentAfterDelete = await fetch(`${baseUrl}/api/content`);
  assert.equal((await contentAfterDelete.json()).objects.segelboot.photos.length, 0);
});
