#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_dependencies
ensure_built

mkdir -p "${WAREHOUSE_DIR}/cache-check"
printf 'cache\n' > "${WAREHOUSE_DIR}/cache-check/cache.tmp"

cli clean cache -c "${CONFIG_PATH}" -p sample-bundle

test ! -e "${WAREHOUSE_DIR}/cache-check/cache.tmp"
find "${WAREHOUSE_DIR}" -type f -name "libnode_test_bundle_${TEST_ID}.zip" -print -quit | grep -q .

echo "clean cache test passed"
