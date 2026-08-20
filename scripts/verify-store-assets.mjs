// Verify committed Chrome Web Store artwork for Blanksmith.
//
// Checks every required PNG under store-assets/ for: exact presence
// (inventory), exact dimensions, and PNG chunk hygiene (only IHDR/IDAT/IEND —
// no metadata chunks that could hide data). Mirrors the ai-limits verifier.
//
// Run: pnpm verify:store-assets

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  REQUIRED_STORE_ASSET_DIMENSIONS,
  readPngDimensions,
  validateAssetFileSizes,
  validateStoreAssetDimensions,
  validateStorePngInventory,
} from "./store-assets-contract.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const assetDirectory = path.join(repositoryRoot, "store-assets");

const pngPaths = [];
for (const entry of await readdir(assetDirectory, {
  recursive: true,
  withFileTypes: true,
})) {
  if (!entry.isFile() || !/\.png$/iu.test(entry.name)) continue;
  pngPaths.push(
    path
      .relative(assetDirectory, path.join(entry.parentPath, entry.name))
      .split(path.sep)
      .join("/"),
  );
}

const errors = [...validateStorePngInventory(pngPaths)];

const dimensions = {};
const fileSizes = {};
for (const name of Object.keys(REQUIRED_STORE_ASSET_DIMENSIONS)) {
  const assetPath = path.join(assetDirectory, name);
  try {
    const buffer = await readFile(assetPath);
    // readPngDimensions also enforces the IHDR/IDAT/IEND-only chunk stream.
    dimensions[name] = readPngDimensions(buffer);
    fileSizes[name] = buffer.byteLength;
  } catch (error) {
    errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

errors.push(...validateStoreAssetDimensions(dimensions));
errors.push(...validateAssetFileSizes(fileSizes));

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log(
    `Verified ${Object.keys(REQUIRED_STORE_ASSET_DIMENSIONS).length} store PNG assets: inventory, dimensions, and PNG chunk hygiene OK.`,
  );
}
