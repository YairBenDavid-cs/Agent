#!/usr/bin/env bash
# Dump everything stored for one user across all coach_platform collections.
#
# Usage:
#   ./dump-user-data.sh you@example.com      # specific user by email
#   ./dump-user-data.sh                      # falls back to most recent user
#
# Override the connection string if your Mongo isn't on the default host:
#   MONGO_URL="mongodb://host:27017/coach_platform?replicaSet=rs0" ./dump-user-data.sh ...
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONGO_URL="${MONGO_URL:-mongodb://localhost:27017/coach_platform?replicaSet=rs0}"
EMAIL="${1:-}"

if [ -n "$EMAIL" ]; then
  EVAL="globalThis.TARGET_EMAIL='${EMAIL}'"
else
  EVAL="globalThis.TARGET_EMAIL=null"
fi

mongosh "$MONGO_URL" --quiet --eval "$EVAL" --file "$DIR/dump-user-data.mongosh.js"
