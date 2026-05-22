#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
EXAMPLES_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd -- "${EXAMPLES_DIR}/.." && pwd)"

APP_DIR="${DYNAMIC_NODE_TEST_APP:-${EXAMPLES_DIR}/sample-app}"
WAREHOUSE_DIR="${DYNAMIC_NODE_TEST_WAREHOUSE:-${EXAMPLES_DIR}/warehouse}"
CONFIG_PATH="${DYNAMIC_NODE_TEST_CONFIG:-${EXAMPLES_DIR}/dynamic-node-cli.yaml}"
TEST_ID="${DYNAMIC_NODE_TEST_ID:-manual}"
AWS_PROFILE="${AWS_PROFILE:-aws-3}"
AWS_REGION="${AWS_REGION:-us-west-1}"
REMOTE="${DYNAMIC_NODE_TEST_REMOTE:-s3://dynamic-loader-code-255491288557/dynamic-node-cli-test/${TEST_ID}}"

export AWS_PROFILE
export AWS_REGION

cli() {
	node "${REPO_ROOT}/src/main.js" "$@"
}

ensure_dependencies() {
	if [[ ! -d "${REPO_ROOT}/node_modules" ]]; then
		(
			cd "${REPO_ROOT}"
			npm install
		)
	fi
}

ensure_config() {
	if [[ ! -f "${CONFIG_PATH}" ]]; then
		"${SCRIPT_DIR}/00-create-config.sh"
	fi
}

has_zip_artifact() {
	[[ -d "${WAREHOUSE_DIR}" ]] && find "${WAREHOUSE_DIR}" -type f -name 'libnode_test_*.zip' -print -quit | grep -q .
}

ensure_built() {
	ensure_config
	if ! has_zip_artifact; then
		cli build -c "${CONFIG_PATH}"
	fi
}

list_artifacts() {
	if [[ -d "${WAREHOUSE_DIR}" ]]; then
		find "${WAREHOUSE_DIR}" -type f | sort
	fi
}

print_context() {
	echo "REPO_ROOT=${REPO_ROOT}"
	echo "APP_DIR=${APP_DIR}"
	echo "WAREHOUSE_DIR=${WAREHOUSE_DIR}"
	echo "CONFIG_PATH=${CONFIG_PATH}"
	echo "TEST_ID=${TEST_ID}"
	echo "AWS_PROFILE=${AWS_PROFILE}"
	echo "AWS_REGION=${AWS_REGION}"
	echo "REMOTE=${REMOTE}"
}
