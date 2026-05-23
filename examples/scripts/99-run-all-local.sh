#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

"${SCRIPT_DIR}/00-create-config.sh"
"${SCRIPT_DIR}/01-smoke.sh"
"${SCRIPT_DIR}/02-toolchain-check.sh"
"${SCRIPT_DIR}/03-build-bundle.sh"
"${SCRIPT_DIR}/04-build-full.sh"
"${SCRIPT_DIR}/05-build-all.sh"
"${SCRIPT_DIR}/14-meta.sh"
"${SCRIPT_DIR}/08-clean-cache.sh"
"${SCRIPT_DIR}/09-clean-useless.sh"
"${SCRIPT_DIR}/10-clean-package.sh"
"${SCRIPT_DIR}/11-clean-all.sh"

echo "all local tests passed"
