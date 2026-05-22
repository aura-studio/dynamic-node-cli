#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_dependencies
ensure_built

print_context
cli push -c "${CONFIG_PATH}"
rm -rf "${WAREHOUSE_DIR}"
cli pull -c "${CONFIG_PATH}" --remote "${REMOTE}" -j 2 -f
list_artifacts

find "${WAREHOUSE_DIR}" -type f -name "libnode_test_bundle_${TEST_ID}.zip" -print -quit | grep -q .
find "${WAREHOUSE_DIR}" -type f -name "libnode_test_full_${TEST_ID}.zip" -print -quit | grep -q .

echo "pull test passed"
