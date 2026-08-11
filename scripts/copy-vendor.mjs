import { cp, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const sourceRoot = path.resolve("node_modules/openseadragon/build/openseadragon");
const targetRoot = path.resolve("vendor/openseadragon");

await mkdir(targetRoot, { recursive: true });
await copyFile(
  path.join(sourceRoot, "openseadragon.min.js"),
  path.join(targetRoot, "openseadragon.min.js")
);
await cp(path.join(sourceRoot, "images"), path.join(targetRoot, "images"), {
  recursive: true,
  force: true
});
await copyFile(
  path.resolve("node_modules/openseadragon/LICENSE.txt"),
  path.join(targetRoot, "LICENSE.txt")
);

console.log(`OpenSeadragon wurde nach ${targetRoot} kopiert.`);
