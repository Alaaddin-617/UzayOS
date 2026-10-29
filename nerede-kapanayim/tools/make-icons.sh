#!/usr/bin/env bash
# icon.svg dosyasından PWA PNG ikonlarını üretir (Linux / macOS).
# Gerekli: ImageMagick 6/7
set -euo pipefail

cd "$(dirname "$0")/.."

if command -v magick >/dev/null 2>&1; then
  IMAGEMAGICK="magick"
elif command -v convert >/dev/null 2>&1; then
  IMAGEMAGICK="convert"
else
  echo "ImageMagick bulunamadı. Linux: sudo apt install imagemagick | macOS: brew install imagemagick" >&2
  exit 1
fi

"$IMAGEMAGICK" -background none icon.svg -resize 192x192 icon-192.png
"$IMAGEMAGICK" -background none icon.svg -resize 512x512 icon-512.png
"$IMAGEMAGICK" -background none icon.svg -resize 512x512 -gravity center -extent 512x512 icon-maskable-512.png

echo "Hazır: icon-192.png, icon-512.png, icon-maskable-512.png"
