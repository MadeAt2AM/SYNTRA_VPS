#!/usr/bin/env bash
# seed_demo_users_v2.sh — v2 seed: Demo Co company + 5 test users.
#
# Test users (all with password Test123!):
#   platform@syntra.com  platform_admin     (no company)
#   admin@demo.com       admin              (Demo Co) — name "Alex"
#   manager@demo.com     manager            (Demo Co) — name "Ronny"
#   staff1@demo.com      employee           (Demo Co) — name "Alice"
#   staff2@demo.com      employee           (Demo Co) — name "Jack"
#
# Same bcrypt-via-Postgres-crypt technique as v1: crypt(pw, gen_salt('bf',12))
# yields a $2a$12$... hash that SYNTRA's bcryptjs verifier accepts.
# Idempotent — uses ON CONFLICT (email) DO UPDATE.

set -euo pipefail
PASSWORD="Test123!"

red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }
green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[1;33m%s\033[0m\n' "$*"; }

if ! docker ps --format '{{.Names}}' | grep -q '^syntra_postgres$'; then
  red "syntra_postgres is not running"
  exit 1
fi

ESCAPED_PW=$(printf "%s" "$PASSWORD" | sed "s/'/''/g")

yellow "  → ensuring pgcrypto is installed..."
docker exec -i syntra_postgres psql -U syntra -d syntra -v ON_ERROR_STOP=1 <<EOF
CREATE EXTENSION IF NOT EXISTS pgcrypto;
EOF

yellow "  → seeding Demo Co + 5 users (idempotent)..."
docker exec -i syntra_postgres psql -U syntra -d syntra -v ON_ERROR_STOP=1 <<EOF
-- Demo company
INSERT INTO companies (name, plan, status, timezone, currency)
VALUES ('Demo Co', 'starter', 'active', 'Asia/Singapore', 'SGD')
ON CONFLICT DO NOTHING;

-- Platform admin (no company)
INSERT INTO users (email, password_hash, name, role, status, must_change_password, company_id)
VALUES ('platform@syntra.com', crypt('${ESCAPED_PW}', gen_salt('bf', 12)), 'Platform Admin', 'platform_admin', 'active', false, NULL)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  name          = EXCLUDED.name,
  role          = EXCLUDED.role,
  status        = EXCLUDED.status;

-- Demo Co users
INSERT INTO users (email, password_hash, name, role, status, must_change_password, company_id)
SELECT 'admin@demo.com',   crypt('${ESCAPED_PW}', gen_salt('bf', 12)), 'Alex',  'admin',    'active', false, c.id FROM companies c WHERE c.name='Demo Co' ORDER BY c.id LIMIT 1
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  name          = EXCLUDED.name,
  role          = EXCLUDED.role,
  company_id    = EXCLUDED.company_id;

INSERT INTO users (email, password_hash, name, role, status, must_change_password, company_id)
SELECT 'manager@demo.com', crypt('${ESCAPED_PW}', gen_salt('bf', 12)), 'Ronny', 'manager',  'active', false, c.id FROM companies c WHERE c.name='Demo Co' ORDER BY c.id LIMIT 1
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  name          = EXCLUDED.name,
  role          = EXCLUDED.role,
  company_id    = EXCLUDED.company_id;

INSERT INTO users (email, password_hash, name, role, status, must_change_password, company_id)
SELECT 'staff1@demo.com',  crypt('${ESCAPED_PW}', gen_salt('bf', 12)), 'Alice', 'employee', 'active', false, c.id FROM companies c WHERE c.name='Demo Co' ORDER BY c.id LIMIT 1
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  name          = EXCLUDED.name,
  role          = EXCLUDED.role,
  company_id    = EXCLUDED.company_id;

INSERT INTO users (email, password_hash, name, role, status, must_change_password, company_id)
SELECT 'staff2@demo.com',  crypt('${ESCAPED_PW}', gen_salt('bf', 12)), 'Jack',  'employee', 'active', false, c.id FROM companies c WHERE c.name='Demo Co' ORDER BY c.id LIMIT 1
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  name          = EXCLUDED.name,
  role          = EXCLUDED.role,
  company_id    = EXCLUDED.company_id;
EOF

green "  ✓ seeded"
docker exec -i syntra_postgres psql -U syntra -d syntra -A -F'|' -c "
SELECT email, name, role, COALESCE(company_id::text, '-') AS company_id, status
FROM users
WHERE email IN ('platform@syntra.com','admin@demo.com','manager@demo.com','staff1@demo.com','staff2@demo.com')
ORDER BY email;
"
