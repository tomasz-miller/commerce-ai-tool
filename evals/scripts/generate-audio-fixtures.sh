#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/fixtures/audio"

mkdir -p "$OUT_DIR"

generate_wav() {
  local filename="$1"
  local voice="$2"
  shift 2
  local text="$*"
  local aiff_path="$OUT_DIR/${filename%.wav}.aiff"
  local wav_path="$OUT_DIR/$filename"

  echo "Generating $filename: \"$text\""
  say -v "$voice" -o "$aiff_path" "$text"
  afconvert -f WAVE -d LEI16 "$aiff_path" "$wav_path"
  rm -f "$aiff_path"
}

if ! command -v say >/dev/null 2>&1; then
  echo "Error: macOS 'say' command is required to generate audio fixtures." >&2
  exit 1
fi

if ! command -v afconvert >/dev/null 2>&1; then
  echo "Error: macOS 'afconvert' command is required to generate audio fixtures." >&2
  exit 1
fi

generate_wav "red-shoes-en.wav" "Samantha" "red shoes"
generate_wav "noisy-filler-en.wav" "Samantha" "um, I want like, red shoes please"
generate_wav "cheapest-running-shoes-en.wav" "Samantha" "cheapest running shoes"
generate_wav "hello-en.wav" "Samantha" "hello"

if say -v "?" 2>/dev/null | grep -q "Zosia"; then
  generate_wav "tapetkniv-pl.wav" "Zosia" "nóż do tapet"
else
  echo "Polish voice Zosia not found; using Samantha for tapetkniv-pl.wav"
  generate_wav "tapetkniv-pl.wav" "Samantha" "nozh do tapet"
fi

echo "Audio fixtures written to $OUT_DIR"
