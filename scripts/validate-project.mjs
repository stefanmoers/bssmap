import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(".");
const requiredFiles = [
  "index.html",
  "styles.css",
  "viewer.js",
  "map.dzi",
  "vendor/openseadragon/openseadragon.min.js",
  "vendor/openseadragon/LICENSE.txt"
];

await Promise.all(requiredFiles.map((file) => access(path.join(root, file))));

const dzi = await readFile(path.join(root, "map.dzi"), "utf8");
const numberAttribute = (name) => {
  const match = dzi.match(new RegExp(`${name}="(\\d+)"`));
  if (!match) {
    throw new Error(`Attribut ${name} fehlt in map.dzi`);
  }
  return Number(match[1]);
};

const width = numberAttribute("Width");
const height = numberAttribute("Height");
const tileSize = numberAttribute("TileSize");
const overlap = numberAttribute("Overlap");
const formatMatch = dzi.match(/Format="([a-z0-9]+)"/i);

if (!formatMatch || formatMatch[1].toLowerCase() !== "png") {
  throw new Error("Für diese Demo werden PNG-Kacheln erwartet.");
}

const maxLevel = Math.ceil(Math.log2(Math.max(width, height)));
let checkedTiles = 0;

for (let level = 0; level <= maxLevel; level += 1) {
  const divisor = 2 ** (maxLevel - level);
  const levelWidth = Math.ceil(width / divisor);
  const levelHeight = Math.ceil(height / divisor);
  const columns = Math.ceil(levelWidth / tileSize);
  const rows = Math.ceil(levelHeight / tileSize);
  const levelDirectory = path.join(root, "map_files", String(level));
  const actualNames = new Set(await readdir(levelDirectory));

  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const name = `${column}_${row}.png`;
      if (!actualNames.delete(name)) {
        throw new Error(`Kachel fehlt: map_files/${level}/${name}`);
      }

      const metadata = await sharp(path.join(levelDirectory, name)).metadata();
      const baseWidth = Math.min(tileSize, levelWidth - column * tileSize);
      const baseHeight = Math.min(tileSize, levelHeight - row * tileSize);
      const expectedWidth = baseWidth
        + (column > 0 ? overlap : 0)
        + (column < columns - 1 ? overlap : 0);
      const expectedHeight = baseHeight
        + (row > 0 ? overlap : 0)
        + (row < rows - 1 ? overlap : 0);

      if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) {
        throw new Error(
          `Falsche Größe für ${level}/${name}: ${metadata.width}x${metadata.height}, `
          + `erwartet ${expectedWidth}x${expectedHeight}`
        );
      }

      checkedTiles += 1;
    }
  }

  if (actualNames.size > 0) {
    throw new Error(`Unerwartete Dateien in Zoomstufe ${level}: ${[...actualNames].join(", ")}`);
  }
}

console.log(
  `Projektprüfung erfolgreich: ${width}x${height} Pixel, `
  + `${maxLevel + 1} Zoomstufen, ${checkedTiles} gültige Kacheln.`
);
