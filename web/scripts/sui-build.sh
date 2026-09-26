#!/usr/bin/env bash
# Compile the AgentVault Move package to base64 bytecode using the Sui toolchain in Docker —
# no local Sui CLI required. Output: move/suica_vault/compiled.json (commit it; the publish step
# reads it and needs no toolchain). Requires the Docker daemon running.
#
#   pnpm sui:build
#
# The Sui framework is provided via a LOCAL sparse clone (move/.sui) instead of a git dependency,
# because the emulated amd64 container can't reliably fetch github. The clone happens on the host
# (good network) and is mounted into the container.
set -euo pipefail
cd "$(dirname "$0")/.."
IMAGE="mysten/sui-tools:testnet"
FRAMEWORK_REV="framework/testnet"
PKG_NAME="${1:-suica_vault}"   # which move/<pkg> to build (default suica_vault)

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running — start Docker Desktop first." >&2
  exit 1
fi

# 1. Ensure the framework sources exist locally (sparse, ~9MB).
if [ ! -d "move/.sui/crates/sui-framework/packages/sui-framework" ]; then
  echo "Fetching Sui framework sources (sparse clone)…"
  rm -rf move/.sui
  git clone --depth 1 --filter=blob:none --sparse --branch "$FRAMEWORK_REV" https://github.com/MystenLabs/sui.git move/.sui
  (cd move/.sui && git sparse-checkout set crates/sui-framework/packages)
fi

# 2. Build in the container (mount all of move/ so the local dep path resolves). Warm build first to
#    create the toolchain's client config (noise discarded), then a clean base64 dump to stdout.
docker run --rm -v "$(pwd)/move":/work "$IMAGE" sh -c "
  sui move build --path /work/$PKG_NAME >/dev/null 2>/tmp/warm.log || { echo 'BUILD FAILED:' >&2; tail -40 /tmp/warm.log >&2; exit 1; }
  sui move build --dump-bytecode-as-base64 --path /work/$PKG_NAME
" > "move/$PKG_NAME/compiled.json" 2> "move/$PKG_NAME/build.log"

node -e "const j=require('./move/$PKG_NAME/compiled.json'); if(!j.modules?.length) throw new Error('no modules — see move/$PKG_NAME/build.log'); console.log('OK — modules:', j.modules.length, 'deps:', JSON.stringify(j.dependencies));"
echo "wrote move/$PKG_NAME/compiled.json"
