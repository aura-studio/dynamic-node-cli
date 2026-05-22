#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_dependencies

os_value="$(cli toolchain describe os)"
arch_value="$(cli toolchain describe arch)"
compiler_value="$(cli toolchain describe compiler)"

mkdir -p "${EXAMPLES_DIR}"

cat > "${CONFIG_PATH}" <<YAML
environments:
  - name: bundle-env
    toolchain:
      os: ${os_value}
      arch: ${arch_value}
      compiler: ${compiler_value}
      variant: bundle
    warehouse:
      local: ${WAREHOUSE_DIR}
      remote:
        - ${REMOTE}
  - name: full-env
    toolchain:
      os: ${os_value}
      arch: ${arch_value}
      compiler: ${compiler_value}
      variant: full
    warehouse:
      local: ${WAREHOUSE_DIR}
      remote:
        - ${REMOTE}

procedures:
  - name: sample-bundle
    environment: bundle-env
    source:
      path: ${APP_DIR}
      entry: index.js
      version: latest
    target:
      namespace: test
      package: bundle
      version: ${TEST_ID}
  - name: sample-full
    environment: full-env
    source:
      path: ${APP_DIR}
      entry: index.js
      version: latest
    target:
      namespace: test
      package: full
      version: ${TEST_ID}
YAML

print_context
echo "created ${CONFIG_PATH}"
