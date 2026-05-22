#!/usr/bin/env bash
set -euo pipefail

VERSION_DEFAULT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
VERSION="${VERSION:-}"
if [[ -z "$VERSION" ]]; then
	VERSION="$VERSION_DEFAULT"
fi
IMAGE_NAME="dynamic-node-cli"

usage() {
	cat <<EOF
Usage: $(basename "$0") [install|docker|release|help] [--version <v>]

Commands:
	install   Install the CLI from this checkout with npm
	docker    Build Docker image with tag :latest and VERSION arg
	release   Create an npm package tarball in dist/
	help      Show this help

Options:
	--version v  Override version (default: current git short SHA or env VERSION)
EOF
}

install() {
	echo "Installing dynamic-node-cli (VERSION=${VERSION})"
	npm install
	VERSION="${VERSION}" npm install -g .
}

docker_build() {
	echo "Building Docker image ${IMAGE_NAME}:latest (VERSION=${VERSION})"
	docker build -t "${IMAGE_NAME}:latest" --build-arg VERSION="${VERSION}" .
}

release() {
	echo "Packing npm release tarball (VERSION=${VERSION})"
	mkdir -p dist
	VERSION="${VERSION}" npm pack --pack-destination dist
	echo "Artifacts in dist/"
}

cmd="${1:-install}"
shift || true

while [[ $# -gt 0 ]]; do
	case "$1" in
		--version)
			VERSION="$2"; shift 2 ;;
		*)
			echo "Unknown option: $1" >&2; usage; exit 1 ;;
	esac
done
case "$cmd" in
	install)
		install ;;
	docker)
		docker_build ;;
	release)
		release ;;
	help|-h|--help)
		usage ;;
	*)
		echo "Unknown command: $cmd" >&2
		usage
		exit 1 ;;
esac
