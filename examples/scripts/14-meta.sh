#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_dependencies
ensure_built

bundle_zip="$(find "${WAREHOUSE_DIR}" -type f -name "libnode_test_bundle_${TEST_ID}.zip" -print -quit)"
full_zip="$(find "${WAREHOUSE_DIR}" -type f -name "libnode_test_full_${TEST_ID}.zip" -print -quit)"

test -n "${bundle_zip}"
test -n "${full_zip}"

cli meta read "${bundle_zip}" | grep -q "variant: bundle"
cli meta call "${bundle_zip}" | grep -q "variant: bundle"
cli meta read "${full_zip}" | grep -q "variant: full"
cli meta call "${full_zip}" | grep -q "variant: full"
cli meta nm "${bundle_zip}" | grep -q "dynamic-meta.json"
cli meta objdump "${full_zip}" | grep -q "dynamic-node-entry.cjs"

echo "meta test passed"
