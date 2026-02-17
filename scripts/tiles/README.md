# Vector Tile Pipeline

This folder contains deterministic scripts for generating and publishing Fiber/HIFLD vector tiles.

## Prerequisites

- `tippecanoe` installed and available on `PATH`
- Optional: AWS CLI (`aws`) for publishing to S3

## Inputs

Set the input files with environment variables (or rely on defaults):

- `FIBER_SOURCE_GEOJSON` (default: `./data/fiber.geojson`)
- `HIFLD_SOURCE_GEOJSON` (default: `./data/hifld.geojson`)

## Outputs

- `./dist/tiles/fiber.mbtiles`
- `./dist/tiles/hifld.mbtiles`

Use the publish script to upload tiles to bucket prefixes consumed by:

- `FIBER_MVT_BASE_URL`
- `HIFLD_MVT_BASE_URL`

## Commands

- `npm run tiles:build:fiber`
- `npm run tiles:build:hifld`
- `npm run tiles:build`
- `npm run tiles:publish`
