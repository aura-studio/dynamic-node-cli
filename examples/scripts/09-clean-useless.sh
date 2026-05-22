#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_dependencies
ensure_built

bundle_zip="$(find "${WAREHOUSE_DIR}" -type f -name "libnode_test_bundle_${TEST_ID}.zip" -print -quit)"
test -n "${bundle_zip}"

backup_zip="${bundle_zip}.2026-05-22T00:00:00Z"
cp "${bundle_zip}" "${backup_zip}"

cli clean useless -c "${CONFIG_PATH}" -p sample-bundle

test ! -e "${backup_zip}"
test -s "${bundle_zip}"

echo "clean useless test passed"
