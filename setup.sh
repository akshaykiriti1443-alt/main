#!/usr/bin/env bash
# Premiere Pro ↔ Claude Code MCP bridge — one-shot setup
set -euo pipefail

TEMP_DIR="/tmp/premiere-mcp-bridge"

echo "==> Initialising submodule..."
git submodule update --init --recursive

echo "==> Installing dependencies and building MCP server..."
cd premiere-pro-mcp
npm install
npm run build

echo "==> Installing CEP panel into Premiere..."
npm run install-cep

echo "==> Creating shared temp folder: $TEMP_DIR"
mkdir -p "$TEMP_DIR"

echo "==> Registering MCP server with Claude Code..."
claude mcp add premiere-pro \
  --env PREMIERE_TEMP_DIR="$TEMP_DIR" \
  -- node "$(pwd)/dist/index.js"

echo ""
echo "Done. Remaining manual steps:"
echo ""
echo "  macOS — enable Premiere debug mode (run once):"
echo "    for v in 8 9 10 11 12 13 14; do defaults write com.adobe.CSXS.\$v PlayerDebugMode 1; done"
echo ""
echo "  Windows — add PlayerDebugMode=1 to HKCU\\Software\\Adobe\\CSXS.8 through CSXS.14 in regedit."
echo ""
echo "  Then:"
echo "    1. Restart Premiere Pro."
echo "    2. Open Window → Extensions → MCP Bridge."
echo "    3. Set Temp Directory to: $TEMP_DIR"
echo "    4. Click Save Config, then Stop Bridge → Start Bridge."
echo "    5. Restart your Claude Code session."
echo "    6. Ask Claude: 'Are you connected to Premiere Pro?'"
