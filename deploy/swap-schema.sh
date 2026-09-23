#!/usr/bin/env bash
# Swaps the active Prisma schema between SQLite (dev) and PostgreSQL (prod).
#
# Usage:
#   ./deploy/swap-schema.sh sqlite   # local dev
#   ./deploy/swap-schema.sh prod     # production deploy
#
# What it does: copies schema.dev.prisma or schema.prod.prisma over schema.prisma,
# then runs prisma generate to refresh the client.

set -euo pipefail

cd "$(dirname "$0")/.."

MODE="${1:-}"
if [[ "$MODE" != "sqlite" && "$MODE" != "prod" ]]; then
  echo "Usage: $0 <sqlite|prod>"
  echo "  sqlite — local development with SQLite"
  echo "  prod   — production with PostgreSQL"
  exit 1
fi

# Save the current dev schema if we're not already in prod mode
if [[ -f prisma/schema.dev.prisma ]]; then
  : # already saved
elif [[ -f prisma/schema.prisma ]] && grep -q 'provider = "sqlite"' prisma/schema.prisma; then
  cp prisma/schema.prisma prisma/schema.dev.prisma
fi

if [[ "$MODE" == "sqlite" ]]; then
  echo "→ Switching to SQLite (dev)"
  if [[ -f prisma/schema.dev.prisma ]]; then
    cp prisma/schema.dev.prisma prisma/schema.prisma
  fi
else
  echo "→ Switching to PostgreSQL (prod)"
  cp prisma/schema.prod.prisma prisma/schema.prisma
fi

echo "→ Running prisma generate..."
bun run db:generate

echo "✓ Done. Active provider: $(grep 'provider = ' prisma/schema.prisma | head -1)"
