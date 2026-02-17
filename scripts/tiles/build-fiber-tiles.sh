#!/usr/bin/env bash
set -euo pipefail

if ! command -v tippecanoe >/dev/null 2>&1; then
  echo "tippecanoe is required but not found on PATH"
  exit 1
fi

INPUT="${FIBER_SOURCE_GEOJSON:-./data/fiber.geojson}"
OUTPUT_DIR="${TILES_OUTPUT_DIR:-./dist/tiles}"
OUTPUT="${OUTPUT_DIR}/fiber.mbtiles"

mkdir -p "${OUTPUT_DIR}"

if [[ ! -f "${INPUT}" ]]; then
  echo "Fiber source GeoJSON not found: ${INPUT}"
  exit 1
fi

tippecanoe \
  -o "${OUTPUT}" \
  -Z 2 -z 14 \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping \
  -l fiber \
  -y NAME -y OPERATOR -y OWNER -y TYPE -y STATUS -y SERVICE_TYPE -y MILES -y STATE_NAME -y CNTY_NAME -y CNTRY_NAME -y QUALITY -y LOC_ID \
  "${INPUT}"

echo "Fiber tiles written to ${OUTPUT}"
