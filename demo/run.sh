#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# Mandala Demo — One-Command Showcase
# ══════════════════════════════════════════════════════════════
# Starts Anvil, deploys contracts, runs the agent competition.
#
# Usage: ./demo/run.sh
# ══════════════════════════════════════════════════════════════

set -euo pipefail
cd "$(dirname "$0")/.."

echo ""
echo "  ╔════════════════════════════════════════════════╗"
echo "  ║  Mandala — Starting Local Demo                ║"
echo "  ╚════════════════════════════════════════════════╝"
echo ""

# ── 1. Check dependencies ──────────────────────────────────────
for cmd in anvil forge npx; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "  ERROR: '$cmd' not found. Install Foundry and Node.js first."
    exit 1
  fi
done

# ── 2. Install Node deps if needed ─────────────────────────────
if [ ! -d "node_modules" ]; then
  echo "  Installing Node.js dependencies..."
  npm install --silent
fi

# ── 3. Build contracts ─────────────────────────────────────────
echo "  Building contracts..."
forge build --silent 2>/dev/null || forge build

# ── 4. Start Anvil (if not already running) ────────────────────
if curl -s http://127.0.0.1:8545 -X POST -H "Content-Type: application/json" \
   --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
   &>/dev/null; then
  echo "  Anvil already running on :8545"
else
  echo "  Starting Anvil..."
  anvil --silent &
  ANVIL_PID=$!
  trap "kill $ANVIL_PID 2>/dev/null; echo '  Anvil stopped.'" EXIT
  sleep 2
  echo "  Anvil started (PID: $ANVIL_PID)"
fi

# ── 5. Deploy contracts ───────────────────────────────────────
echo "  Deploying Mandala contracts..."
npx tsx scripts/deploy-local.ts

echo "  Contracts deployed. Config: demo/deployed.json"
echo ""

# ── 6. Run the showcase ───────────────────────────────────────
npx tsx demo/showcase.ts
