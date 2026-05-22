#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

print_context

if ! command -v aws >/dev/null 2>&1; then
	echo "aws command not found" >&2
	exit 1
fi

aws s3 rm "${REMOTE}" --recursive --profile "${AWS_PROFILE}"

echo "s3 cleanup test passed"
