#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_dependencies
ensure_config

mkdir -p "${WAREHOUSE_DIR}/all-check"
printf 'leftover\n' > "${WAREHOUSE_DIR}/all-check/file.tmp"

cli clean all -c "${CONFIG_PATH}"

if [[ -d "${WAREHOUSE_DIR}" ]] && find "${WAREHOUSE_DIR}" -mindepth 1 -print -quit | grep -q .; then
	echo "warehouse still has contents after clean all" >&2
	exit 1
fi

echo "clean all test passed"
