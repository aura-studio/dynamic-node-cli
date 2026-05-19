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
	install   Install the CLI at current git revision
	docker    Build Docker image with tag :latest and VERSION arg
	release   Build multi-platform binaries into dist/
	help      Show this help

Options:
	--version v  Override version (default: current git short SHA or env VERSION)
EOF
}

install() {
	echo "Installing github.com/aura-studio/dynamic-node-cli@${VERSION}"
	go build -o dynamic-node-cli ./
	echo "Moving dynamic-node-cli to /usr/local/bin"
	sudo mv dynamic-node-cli /usr/local/bin/
}

docker_build() {
	echo "Building Docker image ${IMAGE_NAME}:latest (VERSION=${VERSION})"
	docker build -t "${IMAGE_NAME}:latest" --build-arg VERSION="${VERSION}" .
}

release() {
	echo "Building release binaries (VERSION=${VERSION})"
	mkdir -p dist
	platforms=("linux/amd64" "linux/arm64" "darwin/amd64" "darwin/arm64" "windows/amd64")
	for p in "${platforms[@]}"; do
		IFS="/" read -r GOOS GOARCH <<<"$p"
		outfile="dynamic-node-cli-${GOOS}-${GOARCH}"
		[[ "$GOOS" == "windows" ]] && outfile+=".exe"
		echo "  -> ${outfile}"
		GOOS="$GOOS" GOARCH="$GOARCH" CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o "dist/${outfile}" ./
	done
	echo "Artifacts in dist/"
}

cmd="${1:-install}"
shift || true

# parse optional flags
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
