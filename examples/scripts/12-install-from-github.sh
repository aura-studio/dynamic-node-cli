#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

"${REPO_ROOT}/scripts/install-from-github.sh"
dynamic-node version
dynamic-node-cli toolchain describe all

echo "github install test passed"
