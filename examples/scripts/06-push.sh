#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_dependencies
ensure_built

print_context
cli push -c "${CONFIG_PATH}"

if command -v aws >/dev/null 2>&1; then
	aws s3 ls "${REMOTE}/" --recursive --profile "${AWS_PROFILE}" || true
fi

echo "push test passed"
