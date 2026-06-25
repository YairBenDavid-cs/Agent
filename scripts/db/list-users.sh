#!/usr/bin/env bash
# List all users and whether each has completed onboarding.
#
# Usage:
#   ./list-users.sh
#
# Override the connection string if needed:
#   MONGO_URL="mongodb://host:27017/coach_platform?replicaSet=rs0" ./list-users.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONGO_URL="${MONGO_URL:-mongodb://localhost:27017/coach_platform?replicaSet=rs0}"

mongosh "$MONGO_URL" --quiet --file "$DIR/list-users.mongosh.js"
