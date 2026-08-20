// Unit tests for the store-asset contract (pure logic; no browser).
// Mirrors ai-limits scripts/store-assets-contract.test.js. Lives in scripts/
// so tsc (which includes only src/test/entrypoints) ignores it, while vitest
// runs it via the `scripts/**/*.test.js` include.

import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";
import * as contract from "./store-assets-contract.mjs";
import {
  CAPTURE_LOCALES,
  buildCaptureMatrix,
  buildFixtureRules,
  buildFixtureStorage,
  readPngDimensions,
  validateStoreAssetDimensions,
} from "./store-assets-contract.mjs";

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodedPng(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(6, 9);
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function insertPngChunk(png, type, data = Buffer.alloc(0)) {
  const iendOffset = png.length - 12;
  const typeBytes = Buffer.from(type, "ascii");
  const seg = Buffer.alloc(12 + data.length);
  seg.writeUInt32BE(data.length, 0);
  typeBytes.copy(seg, 4);
  data.copy(seg, 8);
  seg.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return Buffer.concat([
    png.subarray(0, iendOffset),
    seg,
    png.subarray(iendOffset),
  ]);
}

describe("store-asset contract", () => {
  it("targets the four CWS screenshot views in both locales plus one promo tile", () => {
    const matrix = buildCaptureMatrix();
    const ids = matrix.map((c) => c.id);
    // 4 popup/options views x 2 locales + 1 promo + 1 social = 10 captures.
    expect(matrix).toHaveLength(10);
    expect(ids).toContain("include-en");
    expect(ids).toContain("enabled-en");
    expect(ids).toContain("settings-en");
    expect(ids).toContain("global-mode-en");
    expect(ids).toContain("include-zh_CN");
    expect(ids).toContain("enabled-zh_CN");
    expect(ids).toContain("settings-zh_CN");
    expect(ids).toContain("global-mode-zh_CN");
    expect(ids).toContain("promo-en");
    expect(ids).toContain("social-en");
  });

  it("gives every capture an explicit fixture data source and fixed clock", () => {
    const matrix = buildCaptureMatrix();
    expect(
      matrix.every(
        (c) =>
          c.dataSource === "fixture" &&
          c.fixedClock === contract.CAPTURE_FIXED_CLOCK,
      ),
    ).toBe(true);
  });

  it("seeds exclude-only mode only for the global-mode capture", () => {
    const matrix = buildCaptureMatrix();
    for (const capture of matrix) {
      const prefs = capture.fixture?.splPrefs;
      if (capture.view === "global-mode") {
        expect(prefs.mode).toBe("exclude-only");
      } else if (capture.view !== "promo" && capture.view !== "social") {
        expect(prefs.mode).toBe("include-only");
      }
    }
  });

  it("starts the include capture with empty rules and the others populated", () => {
    expect(buildFixtureRules("include")).toEqual([]);
    expect(buildFixtureRules("enabled")).toHaveLength(1);
    expect(buildFixtureRules("settings")).toHaveLength(3);
    expect(buildFixtureRules("global-mode")).toHaveLength(1);
  });

  it("localizes fixture prefs to every supported locale", () => {
    for (const locale of CAPTURE_LOCALES) {
      expect(buildFixtureStorage("enabled", locale).splPrefs.language).toBe(
        locale,
      );
    }
  });

  it("writes zh_CN captures under the zh_CN subdirectory and keeps brand graphics unlocalized", () => {
    const matrix = buildCaptureMatrix();
    const zhPaths = matrix
      .filter((c) => c.locale === "zh_CN")
      .map((c) => c.relativePath);
    expect(zhPaths.every((p) => p.startsWith("chrome-web-store/zh_CN/"))).toBe(
      true,
    );
    const promo = matrix.find((c) => c.view === "promo");
    expect(promo.relativePath).toBe("chrome-web-store/small-promo-440x280.png");
    const social = matrix.find((c) => c.view === "social");
    expect(social.relativePath).toBe("github/social-preview-1280x640.png");
  });

  it("requires exactly ten PNG paths and rejects an extra PNG", () => {
    const exact = Object.keys(contract.REQUIRED_STORE_ASSET_DIMENSIONS);
    expect(exact).toHaveLength(10);
    expect(contract.validateStorePngInventory(exact)).toEqual([]);
    expect(
      contract.validateStorePngInventory([
        ...exact,
        "chrome-web-store/extra.png",
      ]),
    ).toContain("Unexpected store PNG: chrome-web-store/extra.png.");
  });

  it("rejects a wrong screenshot size", () => {
    const errors = validateStoreAssetDimensions({
      "chrome-web-store/screenshot-include-1280x800.png": {
        width: 640,
        height: 400,
      },
    });
    expect(errors).toContain(
      "chrome-web-store/screenshot-include-1280x800.png must be 1280x800.",
    );
  });

  it("requires four Simplified Chinese screenshots without localizing brand graphics", () => {
    const dims = { width: 1280, height: 800 };
    const errors = validateStoreAssetDimensions({
      "chrome-web-store/screenshot-include-1280x800.png": dims,
      "chrome-web-store/screenshot-enabled-1280x800.png": dims,
      "chrome-web-store/screenshot-settings-1280x800.png": dims,
      "chrome-web-store/screenshot-global-mode-1280x800.png": dims,
      "chrome-web-store/small-promo-440x280.png": { width: 440, height: 280 },
      "github/social-preview-1280x640.png": { width: 1280, height: 640 },
    });
    expect(errors).toEqual([
      "chrome-web-store/zh_CN/screenshot-include-1280x800.png is missing.",
      "chrome-web-store/zh_CN/screenshot-enabled-1280x800.png is missing.",
      "chrome-web-store/zh_CN/screenshot-settings-1280x800.png is missing.",
      "chrome-web-store/zh_CN/screenshot-global-mode-1280x800.png is missing.",
    ]);
  });

  it("requires a 1280x640 GitHub social preview below one megabyte", () => {
    const errors = validateStoreAssetDimensions({
      "github/social-preview-1280x640.png": { width: 1280, height: 641 },
    });
    expect(errors).toContain(
      "github/social-preview-1280x640.png must be 1280x640.",
    );
    expect(
      contract.validateAssetFileSizes({
        "github/social-preview-1280x640.png": 1_000_001,
      }),
    ).toContain(
      "github/social-preview-1280x640.png must be smaller than 1000000 bytes.",
    );
  });

  it("reads dimensions from a fully encoded PNG", () => {
    expect(readPngDimensions(encodedPng(1280, 800))).toEqual({
      width: 1280,
      height: 800,
    });
  });

  it("rejects malformed, truncated, CRC-corrupt, and missing-IEND PNGs", () => {
    const valid = encodedPng(1280, 800);
    const badCrc = Buffer.from(valid);
    badCrc[16] ^= 1;
    expect(() => readPngDimensions(Buffer.from("not a PNG"))).toThrow();
    expect(() => readPngDimensions(valid.subarray(0, 33))).toThrow();
    expect(() => readPngDimensions(badCrc)).toThrow();
    expect(() => readPngDimensions(valid.subarray(0, -12))).toThrow();
  });

  it.each(["tEXt", "eXIf"])("rejects the ancillary %s PNG chunk", (type) => {
    const mutated = insertPngChunk(
      encodedPng(1280, 800),
      type,
      Buffer.from(type === "tEXt" ? "comment\0not allowed" : "MM\0*", "binary"),
    );
    expect(() => readPngDimensions(mutated)).toThrow(
      `PNG contains forbidden ${type} chunk.`,
    );
  });

  it("confines and authenticates evidence capture paths", () => {
    expect(
      contract.resolveContainedCapturePath("/tmp/evidence", "nested/c.png"),
    ).toBe("/tmp/evidence/nested/c.png");
    expect(() =>
      contract.resolveContainedCapturePath("/tmp/evidence", "../escape.png"),
    ).toThrow(/escapes/i);
    expect(() =>
      contract.resolveContainedCapturePath("/tmp/evidence", "/abs.png"),
    ).toThrow(/escapes/i);
    const bytes = Buffer.from("trusted", "utf8");
    const hash = createHash("sha256").update(bytes).digest("hex");
    expect(contract.captureMatchesSha256(bytes, hash)).toBe(true);
    expect(contract.captureMatchesSha256(bytes, "0".repeat(64))).toBe(false);
  });
});
