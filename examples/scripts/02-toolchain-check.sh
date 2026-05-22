#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_dependencies
ensure_config

cli toolchain check -c "${CONFIG_PATH}" -p sample-bundle
cli toolchain check -c "${CONFIG_PATH}" -p sample-full

echo "toolchain check passed"
