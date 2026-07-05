#!/usr/bin/env bash
# Proxiq prerequisite + build script
# Usage: bash setup.sh
# Supports: macOS 12+ (Intel & Apple Silicon), Linux x64/arm64, WSL2
# Windows: use Docker or WSL2, then run this script inside the WSL2 terminal.

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

ok()      { echo -e "  ${GREEN}✓${NC}  $1"; }
warn()    { echo -e "  ${YELLOW}⚠${NC}   $1"; }
fail()    { echo -e "  ${RED}✗${NC}  $1"; echo ""; exit 1; }
info()    { echo -e "  ${BLUE}→${NC}  $1"; }
step()    { echo -e "\n${BOLD}$1${NC}"; }
divider() { echo "  ──────────────────────────────────────────────"; }

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  Proxiq — Setup & Prerequisite Check${NC}"
divider

# ── 1. OS + Architecture ──────────────────────────────────────────────────────
step "1 / 6  OS and architecture"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    ok "macOS detected"
    ;;
  Linux)
    if grep -qi microsoft /proc/version 2>/dev/null; then
      ok "Linux (WSL2) detected"
    else
      ok "Linux detected"
    fi
    ;;
  *)
    fail "Unsupported OS: $OS
       On Windows, use WSL2 or Docker — see README.md for details."
    ;;
esac

case "$ARCH" in
  x86_64|amd64)
    ok "Architecture: x64"
    ;;
  arm64|aarch64)
    ok "Architecture: arm64 (Apple Silicon / Graviton)"
    ;;
  *)
    fail "Unsupported architecture: $ARCH"
    ;;
esac

# ── 2. Bun ────────────────────────────────────────────────────────────────────
step "2 / 6  Bun runtime (required: v1.1+)"

BUN_MIN_MAJOR=1
BUN_MIN_MINOR=1

install_bun() {
  info "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  # Make bun available in this shell session immediately
  export BUN_INSTALL="${HOME}/.bun"
  export PATH="${BUN_INSTALL}/bin:${PATH}"
}

if ! command -v bun &>/dev/null; then
  warn "Bun not found"
  install_bun
  if ! command -v bun &>/dev/null; then
    fail "Bun installation failed. Install manually: https://bun.sh
       Then re-run this script."
  fi
  ok "Bun installed: $(bun --version)"
else
  BUN_VERSION="$(bun --version)"
  BUN_MAJOR="$(echo "$BUN_VERSION" | cut -d. -f1)"
  BUN_MINOR="$(echo "$BUN_VERSION" | cut -d. -f2)"
  if [ "$BUN_MAJOR" -lt "$BUN_MIN_MAJOR" ] || \
     { [ "$BUN_MAJOR" -eq "$BUN_MIN_MAJOR" ] && [ "$BUN_MINOR" -lt "$BUN_MIN_MINOR" ]; }; then
    warn "Bun $BUN_VERSION found — v${BUN_MIN_MAJOR}.${BUN_MIN_MINOR}+ required. Upgrading..."
    if ! bun upgrade 2>/dev/null; then
      install_bun
    fi
    ok "Bun upgraded: $(bun --version)"
  else
    ok "Bun $BUN_VERSION"
  fi
fi

# ── 3. Repo check ─────────────────────────────────────────────────────────────
step "3 / 6  Repo integrity"

REQUIRED_FILES=(
  "package.json"
  "bun.lock"
  "packages/core/package.json"
  "packages/cli/package.json"
  "packages/cli/src/index.ts"
  "tsconfig.base.json"
)

MISSING=0
for f in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    warn "Missing: $f"
    MISSING=$((MISSING + 1))
  fi
done

if [ "$MISSING" -gt 0 ]; then
  fail "${MISSING} required file(s) missing.
       Make sure you are running this script from the root of the Proxiq repo.
       Clone with: git clone https://github.com/appmattic/proxiq && cd proxiq"
fi
ok "All required repo files present"

# ── 4. Port ───────────────────────────────────────────────────────────────────
step "4 / 6  Port availability"

PORT=3099
PORT_IN_USE=0

if command -v lsof &>/dev/null; then
  if lsof -i ":${PORT}" &>/dev/null 2>&1; then
    PORT_IN_USE=1
  fi
elif command -v ss &>/dev/null; then
  if ss -tlnp 2>/dev/null | grep -q ":${PORT} "; then
    PORT_IN_USE=1
  fi
elif command -v netstat &>/dev/null; then
  if netstat -tlnp 2>/dev/null | grep -q ":${PORT} "; then
    PORT_IN_USE=1
  fi
fi

if [ "$PORT_IN_USE" -eq 1 ]; then
  warn "Port ${PORT} is already in use."
  warn "Proxiq will fail to start unless you pass --port <other> at runtime."
  if command -v lsof &>/dev/null; then
    echo ""
    lsof -i ":${PORT}" | head -3 | sed 's/^/       /'
    echo ""
  fi
else
  ok "Port ${PORT} is free"
fi

# ── 5. Disk space ─────────────────────────────────────────────────────────────
step "5 / 6  Disk space"

# ~50MB node_modules already present, need ~150MB for build + SQLite + MiniLM if enabled
REQUIRED_MB=300

if command -v df &>/dev/null; then
  case "$OS" in
    Darwin)
      AVAIL_KB=$(df -k . | tail -1 | awk '{print $4}')
      ;;
    Linux)
      AVAIL_KB=$(df -k . | tail -1 | awk '{print $4}')
      ;;
    *)
      AVAIL_KB=999999
      ;;
  esac
  AVAIL_MB=$((AVAIL_KB / 1024))
  if [ "$AVAIL_MB" -lt "$REQUIRED_MB" ]; then
    warn "Only ${AVAIL_MB} MB free — at least ${REQUIRED_MB} MB recommended."
    warn "Note: if semantic caching is enabled, the MiniLM model (~50 MB) downloads on first start."
  else
    ok "${AVAIL_MB} MB available"
  fi
fi

# ── 6. Install deps + build ───────────────────────────────────────────────────
step "6 / 6  Install dependencies and build"

info "Running bun install..."
if ! bun install 2>&1; then
  fail "bun install failed. Check the output above."
fi
ok "Dependencies installed"

echo ""
info "Building Proxiq binary..."
if ! bun run build 2>&1; then
  fail "Build failed. Check the output above."
fi

if [ ! -f "./proxiq" ]; then
  fail "Build completed but ./proxiq binary not found."
fi
ok "Binary built → ./proxiq"

# Quick smoke-test: the binary needs bun in PATH at runtime (it uses #!/usr/bin/env bun)
echo ""
info "Validating binary..."
if ! ./proxiq --version &>/dev/null; then
  fail "Binary did not run. Make sure 'bun' is in your PATH.
       Try: export PATH=\"\$HOME/.bun/bin:\$PATH\""
fi
ok "Binary runs: $(./proxiq --version)"

# ── Config ────────────────────────────────────────────────────────────────────
echo ""
divider
echo ""

if [ ! -f ".proxiq.json" ]; then
  info "No .proxiq.json found — generating default config..."
  ./proxiq config init
  ok "Config created: .proxiq.json"
  echo ""
  warn "Before starting, open .proxiq.json and set:"
  warn "  dashboard.adminPassword  (required to log in to the dashboard)"
  warn "  Example: \"adminPassword\": \"env:PROXIQ_ADMIN_PASSWORD\""
  warn "  Then: export PROXIQ_ADMIN_PASSWORD=yourpassword"
else
  ok "Config already exists: .proxiq.json"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "  ${GREEN}${BOLD}✓  Proxiq is ready.${NC}"
echo ""
echo "  Start the gateway:"
echo "    ./proxiq start"
echo ""
echo "  Open the dashboard:"
echo "    http://127.0.0.1:3099/proxiq/dashboard"
echo ""
echo "  Move to PATH (so you can run 'proxiq' from anywhere):"
if [ "$OS" = "Darwin" ] || [ "$OS" = "Linux" ]; then
  echo "    sudo mv ./proxiq /usr/local/bin/proxiq"
fi
echo ""
echo "  See README.md for SDK integration, SSO setup, and security policies."
echo ""
