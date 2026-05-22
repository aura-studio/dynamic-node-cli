#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_dependencies

(
	cd "${REPO_ROOT}"
	npm run check
)

cli --help
cli version
cli toolchain describe all

echo "smoke test passed"
