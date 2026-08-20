#!/bin/bash
# Create a Chrome Web Store submission ZIP from the built extension output.
# The ZIP contains ONLY the .output/chrome-mv3/ contents — no source,
# node_modules, or metadata junk. Run after `pnpm build`.
set -euo pipefail

OUT_DIR=".output/chrome-mv3"
ZIP_NAME="blanksmith-chrome-mv3.zip"

if [ ! -d "$OUT_DIR" ]; then
  echo "Error: $OUT_DIR not found. Run 'pnpm build' first."
  exit 1
fi

# Remove old ZIP if exists
rm -f "$ZIP_NAME"

# Create ZIP with only the build output contents (no parent directory).
# The Store expects manifest.json at the ZIP root.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$OUT_DIR"
zip -r "$PROJECT_DIR/$ZIP_NAME" . -x ".*" -x "__MACOSX" -x "*.DS_Store"

echo ""
echo "Created: $PROJECT_DIR/$ZIP_NAME"
echo "Contents:"
unzip -l "$PROJECT_DIR/$ZIP_NAME"
echo ""

# SHA-256 for submission tracking
echo "SHA-256:"
shasum -a 256 "$PROJECT_DIR/$ZIP_NAME"
