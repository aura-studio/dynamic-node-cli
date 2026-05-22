#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_dependencies
ensure_built

cli clean package -c "${CONFIG_PATH}"

if [[ -d "${WAREHOUSE_DIR}" ]] && find "${WAREHOUSE_DIR}" -type f -name '*.zip*' -print -quit | grep -q .; then
	echo "zip artifacts still exist after clean package" >&2
	exit 1
fi

echo "clean package test passed"
