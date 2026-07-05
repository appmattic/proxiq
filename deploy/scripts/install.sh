#!/usr/bin/env bash
# Proxiq installer — Linux and macOS
# Usage: curl -fsSL https://get.proxiq.io/install.sh | sh
#
# Options (env vars):
#   PROXIQ_VERSION  — specific version to install (default: latest)
#   PROXIQ_BIN_DIR  — installation directory (default: /usr/local/bin)

set -euo pipefail

REPO="appmattic/proxiq"
BIN_DIR="${PROXIQ_BIN_DIR:-/usr/local/bin}"
VERSION="${PROXIQ_VERSION:-latest}"

# Detect platform
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
  x86_64)  ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH" && exit 1 ;;
esac

case "$OS" in
  linux|darwin) ;;
  *) echo "Unsupported OS: $OS" && exit 1 ;;
esac

if [ "$VERSION" = "latest" ]; then
  VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed 's/.*"v\([^"]*\)".*/\1/')"
fi

BINARY="proxiq-${OS}-${ARCH}"
URL="https://github.com/${REPO}/releases/download/v${VERSION}/${BINARY}"
TMP_FILE="$(mktemp)"

echo "Installing Proxiq v${VERSION} (${OS}/${ARCH})..."
curl -fsSL "$URL" -o "$TMP_FILE"
chmod +x "$TMP_FILE"

if [ -w "$BIN_DIR" ]; then
  mv "$TMP_FILE" "${BIN_DIR}/proxiq"
else
  sudo mv "$TMP_FILE" "${BIN_DIR}/proxiq"
fi

echo ""
echo "Proxiq v${VERSION} installed to ${BIN_DIR}/proxiq"
echo ""
echo "Next steps:"
echo "  proxiq config init   # create .proxiq.json"
echo "  proxiq start         # start the proxy on :3099"
