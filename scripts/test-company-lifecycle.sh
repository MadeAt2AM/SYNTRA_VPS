#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

assert_contains() {
  local file="$1"
  local expected="$2"
  if ! grep -Fq "$expected" "$ROOT/$file"; then
    printf 'FAIL: %s does not contain %s\n' "$file" "$expected" >&2
    exit 1
  fi
}

assert_contains "artifacts/api-server/src/routes/platform.ts" '.delete(companies)'
assert_contains "artifacts/api-server/src/routes/platform.ts" 'res.status(204).send()'
assert_contains "artifacts/web-app/src/pages/platform.tsx" 'Deactivate'
assert_contains "artifacts/web-app/src/pages/platform.tsx" 'Reactivate'
assert_contains "artifacts/web-app/src/pages/platform.tsx" 'All company users, shifts, invitations and historical data will be permanently deleted.'
assert_contains "artifacts/web-app/src/pages/platform.tsx" "company.status !== 'active' ? \"opacity-60 grayscale\""
assert_contains "artifacts/web-app/src/lib/platform-api.ts" 'fetchPlatform<void>'

printf 'PASS: company lifecycle contract\n'
