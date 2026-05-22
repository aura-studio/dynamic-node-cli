#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_dependencies
ensure_config

cli build -c "${CONFIG_PATH}" -p sample-full
list_artifacts

find "${WAREHOUSE_DIR}" -type f -name "libnode_test_full_${TEST_ID}.zip" -print -quit | grep -q .
echo "full build test passed"
