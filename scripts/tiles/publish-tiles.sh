#!/usr/bin/env bash
set -euo pipefail

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI is required for publishing"
  exit 1
fi

: "${FIBER_TILE_PUBLISH_URI:?Set FIBER_TILE_PUBLISH_URI (e.g. s3://bucket/fiber)}"
: "${HIFLD_TILE_PUBLISH_URI:?Set HIFLD_TILE_PUBLISH_URI (e.g. s3://bucket/hifld)}"

OUTPUT_DIR="${TILES_OUTPUT_DIR:-./dist/tiles}"

if [[ ! -f "${OUTPUT_DIR}/fiber.mbtiles" || ! -f "${OUTPUT_DIR}/hifld.mbtiles" ]]; then
  echo "Missing mbtiles artifacts in ${OUTPUT_DIR}; run tiles build first"
  exit 1
fi

aws s3 cp "${OUTPUT_DIR}/fiber.mbtiles" "${FIBER_TILE_PUBLISH_URI}/fiber.mbtiles"
aws s3 cp "${OUTPUT_DIR}/hifld.mbtiles" "${HIFLD_TILE_PUBLISH_URI}/hifld.mbtiles"

echo "Uploaded tile artifacts"
