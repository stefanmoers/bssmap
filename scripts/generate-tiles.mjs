import { access, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const args = process.argv.slice(2);
const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const input = valueAfter("--input") ?? args.find((arg) => !arg.startsWith("--"));
const output = valueAfter("--output") ?? "map";

if (!input) {
  console.error("Verwendung: npm run generate-tiles -- --input <karte.png> [--output map]");
  process.exit(2);
}

await access(input);

const outputBase = path.resolve(output);
await rm(`${outputBase}.dzi`, { force: true });
await rm(`${outputBase}_files`, { recursive: true, force: true });

await sharp(input, { limitInputPixels: false })
  .png({
    compressionLevel: 9,
    adaptiveFiltering: true
  })
  .tile({
    size: 512,
    overlap: 1,
    layout: "dz",
    container: "fs"
  })
  .toFile(outputBase);

// libvips legt zusätzliche Erzeugungsmetadaten ab, die der Viewer nicht benötigt.
await rm(path.join(`${outputBase}_files`, "vips-properties.xml"), { force: true });

console.log(`Deep-Zoom-Ausgabe erzeugt: ${outputBase}.dzi und ${outputBase}_files/`);
