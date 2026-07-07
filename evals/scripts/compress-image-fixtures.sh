#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IMG_DIR="$ROOT_DIR/fixtures/images"
MAX_EDGE=512
JPEG_QUALITY=80

mkdir -p "$IMG_DIR"

if ! command -v sips >/dev/null 2>&1; then
  echo "Error: macOS 'sips' is required to compress image fixtures." >&2
  exit 1
fi

compress_jpeg() {
  local file="$1"
  echo "Compressing JPEG: $file"
  sips -Z "$MAX_EDGE" "$file" --out "$file" >/dev/null
  sips -s format jpeg -s formatOptions "$JPEG_QUALITY" "$file" --out "$file" >/dev/null
}

convert_png_to_jpeg() {
  local png="$1"
  local jpeg="${png%.png}.jpeg"
  echo "Converting PNG to JPEG: $png -> $jpeg"
  sips -Z "$MAX_EDGE" "$png" --out "$jpeg" >/dev/null
  sips -s format jpeg -s formatOptions "$JPEG_QUALITY" "$jpeg" --out "$jpeg" >/dev/null
  rm -f "$png"
}

for file in "$IMG_DIR"/*.jpeg "$IMG_DIR"/*.jpg; do
  if [[ -f "$file" ]]; then
    compress_jpeg "$file"
  fi
done

for file in "$IMG_DIR"/*.png; do
  if [[ -f "$file" ]]; then
    convert_png_to_jpeg "$file"
  fi
done

echo "Image fixtures written to $IMG_DIR"
ls -lah "$IMG_DIR"
