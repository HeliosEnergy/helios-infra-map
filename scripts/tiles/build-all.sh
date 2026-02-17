#!/usr/bin/env bash
set -euo pipefail

"$(dirname "$0")/build-fiber-tiles.sh"
"$(dirname "$0")/build-hifld-tiles.sh"
