#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

cleanup_remote() {
	if [[ "${DYNAMIC_NODE_TEST_KEEP_REMOTE:-0}" != "1" ]]; then
		"${SCRIPT_DIR}/13-clean-s3.sh"
	fi
}
trap cleanup_remote EXIT

"${SCRIPT_DIR}/00-create-config.sh"
"${SCRIPT_DIR}/01-smoke.sh"
"${SCRIPT_DIR}/02-toolchain-check.sh"
"${SCRIPT_DIR}/05-build-all.sh"
"${SCRIPT_DIR}/06-push.sh"
"${SCRIPT_DIR}/07-pull.sh"
"${SCRIPT_DIR}/08-clean-cache.sh"
"${SCRIPT_DIR}/09-clean-useless.sh"
"${SCRIPT_DIR}/10-clean-package.sh"
"${SCRIPT_DIR}/11-clean-all.sh"
"${SCRIPT_DIR}/12-install-from-github.sh"

echo "all tests with s3 passed"
