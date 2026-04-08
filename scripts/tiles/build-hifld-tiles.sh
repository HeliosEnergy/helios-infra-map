#!/usr/bin/env bash
set -euo pipefail

if ! command -v tippecanoe >/dev/null 2>&1; then
  echo "tippecanoe is required but not found on PATH"
  exit 1
fi

INPUT="${HIFLD_SOURCE_GEOJSON:-./data/hifld.geojson}"
OUTPUT_DIR="${TILES_OUTPUT_DIR:-./dist/tiles}"
OUTPUT="${OUTPUT_DIR}/hifld.mbtiles"

mkdir -p "${OUTPUT_DIR}"

if [[ ! -f "${INPUT}" ]]; then
  echo "HIFLD source GeoJSON not found: ${INPUT}"
  exit 1
fi

tippecanoe \
  -o "${OUTPUT}" \
  -Z 2 -z 14 \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping \
  -l hifld \
  -y VOLTAGE -y VOLT_CLASS -y OWNER -y STATUS -y TYPE -y SUB_1 -y SUB_2 -y ID -y OBJECTID \
  "${INPUT}"

echo "HIFLD tiles written to ${OUTPUT}"
