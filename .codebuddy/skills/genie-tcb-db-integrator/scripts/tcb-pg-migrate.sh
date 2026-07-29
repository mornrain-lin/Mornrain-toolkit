#!/usr/bin/env bash
# tcb-pg-migrate.sh — Execute DDL / migration SQL against TCB PostgreSQL
# This script is RESTRICTED to LLM Agent use only. Never expose via web app API.
# Uses cloudbase_postgres role for DDL operations (CREATE TABLE, ALTER, RLS policies).
#
# Usage:
#   bash tcb-pg-migrate.sh --project-dir /workspace --sql "CREATE TABLE ..."
#
# IMPORTANT: exec-pgsql does NOT support multiple statements in one call.
#            Each statement must be a separate invocation.
#
# Prerequisites:
#   - /workspace/.env.tcb must exist with CLOUDBASE_ENV_ID
#   - auth-proxy must be running (tcb-env.auth-proxy.local)

set -euo pipefail

PROJECT_DIR="/workspace"
SQL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    --sql) SQL="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$SQL" ]; then
  echo "Usage: tcb-pg-migrate.sh [--project-dir <path>] --sql <sql>" >&2
  exit 1
fi

ENV_FILE="${PROJECT_DIR}/.env.tcb"
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: ${ENV_FILE} not found. Run ensure-cloudbase-env.sh first." >&2
  exit 1
fi

source "$ENV_FILE"

if [ -z "${CLOUDBASE_ENV_ID:-}" ]; then
  echo "Error: CLOUDBASE_ENV_ID not set in ${ENV_FILE}" >&2
  exit 1
fi

# Use auth-proxy to execute SQL (migrate mode = cloudbase_postgres role)
# Base64-encode SQL to avoid WAF interception of DDL keywords
SQL_B64=$(printf '%s' "$SQL" | base64 -w 0)
RESPONSE=$(curl -sS -w '\n%{http_code}' -X POST "http://tcb-env.auth-proxy.local/pg/query" \
  -H "Content-Type: application/json" \
  -d "{\"sql_b64\": \"${SQL_B64}\", \"mode\": \"migrate\"}" 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
RESPONSE=$(echo "$RESPONSE" | sed '$d')

# Check HTTP status
if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "000" ]; then
  echo "Migration Error: HTTP $HTTP_CODE — $RESPONSE" >&2
  echo "SQL: $SQL" >&2
  exit 1
fi

# Check for error fields in JSON response
if echo "$RESPONSE" | jq -e '.code' >/dev/null 2>&1; then
  CODE=$(echo "$RESPONSE" | jq -r '.code')
  ERROR=$(echo "$RESPONSE" | jq -r '.error // .message // "Unknown error"')
  echo "Migration Error: [$CODE] $ERROR" >&2
  echo "SQL: $SQL" >&2
  exit 1
fi

echo "OK"
