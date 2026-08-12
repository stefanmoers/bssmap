import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(".");
const requiredFiles = [
  ".env.example",
  "Dockerfile",
  "compose.yaml",
  "index.html",
  "styles.css",
  "viewer.js",
  "runtime-config.json",
  "data/maps.json",
  "data/objects.json",
  "images/objects/README.md",
  "maps/object-map/map.dzi",
  "maps/detail-map/map.dzi",
  "server/app.mjs",
  "server/cli.mjs",
  "server/database.mjs",
  "server/manage-users.mjs",
  "server/security.mjs",
  "vendor/openseadragon/openseadragon.min.js",
  "vendor/openseadragon/LICENSE.txt"
];

await Promise.all(requiredFiles.map((file) => access(path.join(root, file))));

const html = await readFile(path.join(root, "index.html"), "utf8");
const htmlIds = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = htmlIds.filter((id, index) => htmlIds.indexOf(id) !== index);
if (duplicateIds.length > 0) {
  throw new Error(`Doppelte HTML-IDs: ${[...new Set(duplicateIds)].join(", ")}`);
}

const requiredIds = [
  "viewer",
  "map-switcher",
  "objects-open",
  "server-access",
  "object-panel",
  "object-search",
  "object-list",
  "object-detail",
  "object-editor-actions",
  "description-form",
  "photo-upload-form",
  "photo-dialog",
  "server-dialog",
  "coordinate-editor",
  "editor-close"
];
for (const id of requiredIds) {
  if (!htmlIds.includes(id)) {
    throw new Error(`Benötigte HTML-ID fehlt: ${id}`);
  }
}

const runtimeConfig = JSON.parse(await readFile(path.join(root, "runtime-config.json"), "utf8"));
if (runtimeConfig.serverFeatures !== false || runtimeConfig.apiBaseUrl !== "") {
  throw new Error("runtime-config.json muss für GitHub Pages die Serverfunktionen deaktivieren.");
}

const isSafeRelativePath = (value) => typeof value === "string"
  && value.length > 0
  && !path.isAbsolute(value)
  && !value.split(/[\\/]/).includes("..");

const parseDzi = async (relativePath) => {
  const dzi = await readFile(path.join(root, relativePath), "utf8");
  const numberAttribute = (name) => {
    const match = dzi.match(new RegExp(`${name}="(\\d+)"`));
    if (!match) {
      throw new Error(`Attribut ${name} fehlt in ${relativePath}`);
    }
    return Number(match[1]);
  };
  const formatMatch = dzi.match(/Format="([a-z0-9]+)"/i);
  if (!formatMatch || formatMatch[1].toLowerCase() !== "png") {
    throw new Error(`Für ${relativePath} werden PNG-Kacheln erwartet.`);
  }
  return {
    width: numberAttribute("Width"),
    height: numberAttribute("Height"),
    tileSize: numberAttribute("TileSize"),
    overlap: numberAttribute("Overlap")
  };
};

const validateTilePyramid = async (map, dzi) => {
  const maxLevel = Math.ceil(Math.log2(Math.max(dzi.width, dzi.height)));
  const tileRoot = path.join(
    root,
    path.dirname(map.tileSource),
    `${path.basename(map.tileSource, path.extname(map.tileSource))}_files`
  );
  let checkedTiles = 0;

  for (let level = 0; level <= maxLevel; level += 1) {
    const divisor = 2 ** (maxLevel - level);
    const levelWidth = Math.ceil(dzi.width / divisor);
    const levelHeight = Math.ceil(dzi.height / divisor);
    const columns = Math.ceil(levelWidth / dzi.tileSize);
    const rows = Math.ceil(levelHeight / dzi.tileSize);
    const levelDirectory = path.join(tileRoot, String(level));
    const actualNames = new Set(await readdir(levelDirectory));

    for (let column = 0; column < columns; column += 1) {
      for (let row = 0; row < rows; row += 1) {
        const name = `${column}_${row}.png`;
        if (!actualNames.delete(name)) {
          throw new Error(`Kachel fehlt: ${path.relative(root, path.join(levelDirectory, name))}`);
        }

        const metadata = await sharp(path.join(levelDirectory, name)).metadata();
        const baseWidth = Math.min(dzi.tileSize, levelWidth - column * dzi.tileSize);
        const baseHeight = Math.min(dzi.tileSize, levelHeight - row * dzi.tileSize);
        const expectedWidth = baseWidth
          + (column > 0 ? dzi.overlap : 0)
          + (column < columns - 1 ? dzi.overlap : 0);
        const expectedHeight = baseHeight
          + (row > 0 ? dzi.overlap : 0)
          + (row < rows - 1 ? dzi.overlap : 0);

        if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) {
          throw new Error(
            `Falsche Größe für ${path.relative(root, path.join(levelDirectory, name))}: `
            + `${metadata.width}x${metadata.height}, erwartet ${expectedWidth}x${expectedHeight}`
          );
        }
        checkedTiles += 1;
      }
    }

    if (actualNames.size > 0) {
      throw new Error(
        `Unerwartete Dateien in ${path.relative(root, levelDirectory)}: ${[...actualNames].join(", ")}`
      );
    }
  }

  return { levels: maxLevel + 1, checkedTiles };
};

const mapData = JSON.parse(await readFile(path.join(root, "data/maps.json"), "utf8"));
if (mapData.schemaVersion !== 1 || !Array.isArray(mapData.maps) || mapData.maps.length < 2) {
  throw new Error("data/maps.json hat ein ungültiges Schema.");
}

const mapIds = new Set();
const mapById = new Map();
const mapStats = [];
for (const map of mapData.maps) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(map.id)) {
    throw new Error(`Ungültige Karten-ID: ${map.id}`);
  }
  if (mapIds.has(map.id)) {
    throw new Error(`Doppelte Karten-ID: ${map.id}`);
  }
  mapIds.add(map.id);
  mapById.set(map.id, map);

  if (!map.name || !isSafeRelativePath(map.tileSource) || path.extname(map.tileSource) !== ".dzi") {
    throw new Error(`Unvollständige Kartendefinition: ${map.id}`);
  }
  if (!Number.isInteger(map.width) || map.width <= 0
      || !Number.isInteger(map.height) || map.height <= 0) {
    throw new Error(`Ungültige Bildgröße für Karte: ${map.id}`);
  }
  const view = map.defaultView;
  if (!view || ![view.x, view.y, view.width, view.height].every(Number.isInteger)
      || view.x < 0 || view.y < 0 || view.width <= 0 || view.height <= 0
      || view.x + view.width > map.width || view.y + view.height > map.height) {
    throw new Error(`Ungültige Standardansicht für Karte: ${map.id}`);
  }

  const dzi = await parseDzi(map.tileSource);
  if (dzi.width !== map.width || dzi.height !== map.height) {
    throw new Error(
      `Die Bildgröße in data/maps.json stimmt für ${map.id} nicht mit ${map.tileSource} überein.`
    );
  }
  if (dzi.tileSize <= 0 || dzi.overlap < 0) {
    throw new Error(`Ungültige Kachelparameter in ${map.tileSource}`);
  }
  const pyramid = await validateTilePyramid(map, dzi);
  mapStats.push({ map, ...pyramid });
}

for (const requiredMapId of ["object-map", "detail-map"]) {
  if (!mapIds.has(requiredMapId)) {
    throw new Error(`Benötigte Karten-ID fehlt: ${requiredMapId}`);
  }
}
if (!mapIds.has(mapData.defaultMapId) || mapData.defaultMapId !== "object-map") {
  throw new Error("object-map muss als gültige Standardkarte eingetragen sein.");
}

const objectData = JSON.parse(await readFile(path.join(root, "data/objects.json"), "utf8"));
if (objectData.schemaVersion !== 2 || !Array.isArray(objectData.objects)) {
  throw new Error("data/objects.json hat ein ungültiges Schema.");
}

const objectIds = new Set();
const positionCounts = new Map([...mapIds].map((mapId) => [mapId, 0]));
for (const object of objectData.objects) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(object.id)) {
    throw new Error(`Ungültige Objekt-ID: ${object.id}`);
  }
  if (objectIds.has(object.id)) {
    throw new Error(`Doppelte Objekt-ID: ${object.id}`);
  }
  objectIds.add(object.id);

  const validDepth = object.depthMeters === null
    || (Number.isFinite(object.depthMeters) && object.depthMeters >= 0);
  if (!object.name || !object.category || !validDepth) {
    throw new Error(`Unvollständiges Objekt: ${object.id}`);
  }
  if (!object.positions || typeof object.positions !== "object" || Array.isArray(object.positions)) {
    throw new Error(`positions muss ein Objekt sein: ${object.id}`);
  }
  if ("x" in object || "y" in object) {
    throw new Error(`Veraltete globale Koordinaten bei Objekt: ${object.id}`);
  }
  if (!object.positions["object-map"]) {
    throw new Error(`Position auf der Objektkarte fehlt: ${object.id}`);
  }

  for (const [mapId, position] of Object.entries(object.positions)) {
    const map = mapById.get(mapId);
    if (!map) {
      throw new Error(`Unbekannte Karten-ID bei Objekt ${object.id}: ${mapId}`);
    }
    if (!Number.isInteger(position?.x) || !Number.isInteger(position?.y)
        || position.x < 0 || position.x >= map.width
        || position.y < 0 || position.y >= map.height) {
      throw new Error(`Objektkoordinaten außerhalb von ${mapId}: ${object.id}`);
    }
    positionCounts.set(mapId, positionCounts.get(mapId) + 1);
  }

  if (!Array.isArray(object.photos)) {
    throw new Error(`photos muss ein Array sein: ${object.id}`);
  }
  for (const photo of object.photos) {
    if (!photo.src || !photo.alt) {
      throw new Error(`Foto ohne src oder alt bei Objekt: ${object.id}`);
    }
    if (!isSafeRelativePath(photo.src) || /^(?:https?:|\/)/.test(photo.src)) {
      throw new Error(`Foto muss einen sicheren relativen Pfad verwenden: ${photo.src}`);
    }
    await access(path.join(root, photo.src));
  }
}

const mapSummary = mapStats
  .map(({ map, levels, checkedTiles }) => (
    `${map.name} ${map.width}x${map.height} Pixel, ${levels} Zoomstufen, ${checkedTiles} Kacheln`
  ))
  .join("; ");
const positionSummary = [...positionCounts]
  .map(([mapId, count]) => `${mapId}: ${count}`)
  .join(", ");

console.log(
  `Projektprüfung erfolgreich: ${mapSummary}; `
  + `${objectData.objects.length} Tauchziele (${positionSummary}).`
);
