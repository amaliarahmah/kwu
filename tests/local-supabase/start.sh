#!/usr/bin/env bash
# Menjalankan tiruan Supabase lokal (Postgres + Supabase Auth + PostgREST + gateway) untuk pengujian.
# Kebutuhan: PostgreSQL 16 terpasang (initdb/pg_ctl), Node.js, akses internet untuk unduhan pertama.
# Pemakaian: bash tests/local-supabase/start.sh   → aplikasi di http://localhost:8080
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STACK="${STACK_DIR:-/opt/kwu-stack}"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PG_PORT=5433
AUTH_VERSION=2.180.0
PGRST_VERSION=12.2.3
JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long

mkdir -p "$STACK"
cd "$STACK"

if [ ! -x ./auth ]; then
  curl -sSL -o auth.tgz "https://github.com/supabase/auth/releases/download/v$AUTH_VERSION/auth-v$AUTH_VERSION-x86.tar.gz"
  tar xzf auth.tgz
fi
if [ ! -x ./postgrest ]; then
  curl -sSL -o pgrst.tar.xz "https://github.com/PostgREST/postgrest/releases/download/v$PGRST_VERSION/postgrest-v$PGRST_VERSION-linux-static-x64.tar.xz"
  tar xf pgrst.tar.xz
fi

# Hentikan layanan lama & buat database baru yang bersih.
pkill -f "^./auth serve" 2>/dev/null || true
pkill -f "^./postgrest postgrest.conf" 2>/dev/null || true
pkill -f "local-supabase/gateway.mjs" 2>/dev/null || true
as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
if [ -d "$STACK/pgdata" ]; then as_pg "$PG_BIN/pg_ctl -D $STACK/pgdata stop -m fast" >/dev/null 2>&1 || true; rm -rf "$STACK/pgdata"; fi
mkdir -p "$STACK/pgdata" "$STACK/pgsock"
[ "$(id -u)" = 0 ] && chown -R postgres "$STACK/pgdata" "$STACK/pgsock"
as_pg "$PG_BIN/initdb -D $STACK/pgdata -A trust -U postgres" >/dev/null
as_pg "$PG_BIN/pg_ctl -D $STACK/pgdata -o '-p $PG_PORT -k $STACK/pgsock' -l $STACK/pgsock/pg.log start" >/dev/null
sleep 2

PSQL="psql -h $STACK/pgsock -p $PG_PORT -v ON_ERROR_STOP=1 -q"
$PSQL -U postgres -c "create database kwu"
$PSQL -U postgres -d kwu -f "$ROOT/tests/local-supabase/bootstrap.sql"

cat > auth.env <<ENV
GOTRUE_DB_DRIVER=postgres
DATABASE_URL=postgres://supabase_auth_admin:auth@localhost:$PG_PORT/kwu?sslmode=disable
GOTRUE_DB_MIGRATIONS_PATH=$STACK/migrations
GOTRUE_JWT_SECRET=$JWT_SECRET
GOTRUE_JWT_EXP=3600
GOTRUE_JWT_AUD=authenticated
GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
GOTRUE_JWT_ADMIN_ROLES=service_role
GOTRUE_SITE_URL=http://localhost:8080
API_EXTERNAL_URL=http://localhost:8080/auth/v1
GOTRUE_API_HOST=127.0.0.1
PORT=9999
GOTRUE_MAILER_AUTOCONFIRM=true
GOTRUE_DISABLE_SIGNUP=false
GOTRUE_EXTERNAL_EMAIL_ENABLED=true
GOTRUE_LOG_LEVEL=warn
GOTRUE_RATE_LIMIT_TOKEN_REFRESH=10000
GOTRUE_RATE_LIMIT_VERIFY=10000
GOTRUE_RATE_LIMIT_OTP=10000
ENV
(set -a; . ./auth.env; set +a; ./auth migrate >/dev/null 2>&1)

# Skema aplikasi dijalankan sebagai peran non-superuser, seperti SQL Editor Supabase.
$PSQL -U supa_admin -d kwu -f "$ROOT/supabase/schema.sql" 2>&1 | grep -v "already exists" || true

cat > postgrest.conf <<CONF
db-uri = "postgres://authenticator:authenticator@localhost:$PG_PORT/kwu"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = 3001
db-max-rows = 1000
CONF

(set -a; . ./auth.env; set +a; nohup ./auth serve > auth.log 2>&1 &)
nohup ./postgrest postgrest.conf > postgrest.log 2>&1 &
nohup node "$ROOT/tests/local-supabase/gateway.mjs" > gateway.log 2>&1 &

for _ in $(seq 1 30); do
  if curl -sf localhost:8080/auth/v1/health >/dev/null && curl -sf -o /dev/null localhost:8080/rest/v1/ -H "apikey: x"; then break; fi
  sleep 1
done
echo "Supabase lokal siap: http://localhost:8080  (psql: $PSQL -U postgres -d kwu)"
