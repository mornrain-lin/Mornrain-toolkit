#!/usr/bin/env bash
# tcb-pg-query.sh — Query TCB PostgreSQL (ad-hoc SQL + built-in shortcuts)
# This script is RESTRICTED to LLM Agent use only.
#
# === Custom SQL ===
#   bash tcb-pg-query.sh --project-dir /workspace --sql "SELECT COUNT(*) FROM items"
#
# === Built-in shortcuts ===
#   bash tcb-pg-query.sh --project-dir /workspace tables
#   bash tcb-pg-query.sh --project-dir /workspace columns --table items
#   bash tcb-pg-query.sh --project-dir /workspace indexes --table items
#   bash tcb-pg-query.sh --project-dir /workspace rls --table items
#   bash tcb-pg-query.sh --project-dir /workspace count --table items
#   bash tcb-pg-query.sh --project-dir /workspace sample --table items --limit 5
#
# Prerequisites:
#   - /workspace/.env.tcb must exist with CLOUDBASE_ENV_ID
#   - auth-proxy must be running (tcb-env.auth-proxy.local)

set -euo pipefail

PROJECT_DIR="/workspace"
SQL=""
ACTION=""
TABLE=""
LIMIT_N="10"

while [[ $# -gt 0 ]]; do
  case $1 in
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    --sql) SQL="$2"; shift 2 ;;
    --table) TABLE="$2"; shift 2 ;;
    --limit) LIMIT_N="$2"; shift 2 ;;
    tables|columns|indexes|rls|count|sample)
      ACTION="$1"; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$PROJECT_DIR" ]; then
  PROJECT_DIR="/workspace"
fi

ENV_FILE="${PROJECT_DIR}/.env.tcb"
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: ${ENV_FILE} not found. Run ensure-cloudbase-env.sh first." >&2
  exit 1
fi
source "$ENV_FILE"
if [ -z "${CLOUDBASE_ENV_ID:-}" ]; then
  echo "Error: CLOUDBASE_ENV_ID not set" >&2
  exit 1
fi

exec_sql() {
  local sql="$1"
  local sql_b64 result http_code
  sql_b64=$(printf '%s' "$sql" | base64 -w 0)
  result=$(curl -sS -w '\n%{http_code}' -X POST "http://tcb-env.auth-proxy.local/pg/query" \
    -H "Content-Type: application/json" \
    -d "{\"sql_b64\": \"${sql_b64}\", \"mode\": \"write\"}" 2>&1)
  http_code=$(echo "$result" | tail -1)
  result=$(echo "$result" | sed '$d')

  if [ "$http_code" != "200" ] && [ "$http_code" != "000" ]; then
    echo "SQL Error: HTTP $http_code — $result" >&2
    return 1
  fi

  if echo "$result" | jq -e '.code' >/dev/null 2>&1; then
    local code err_msg
    code=$(echo "$result" | jq -r '.code')
    err_msg=$(echo "$result" | jq -r '.error // .message // "Unknown error"')
    echo "SQL Error: [$code] $err_msg" >&2
    return 1
  fi
  echo "$result"
}

# Built-in shortcuts
case "${ACTION:-}" in
  tables)
    SQL="SELECT c.relname AS table_name, COALESCE(d.description, '') AS comment,
      (SELECT COUNT(*) FROM information_schema.columns ic WHERE ic.table_schema='public' AND ic.table_name=c.relname) AS column_count
    FROM pg_class c
      JOIN pg_namespace n ON c.relnamespace = n.oid
      LEFT JOIN pg_description d ON c.oid = d.objoid AND d.objsubid = 0
    WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname"
    ;;
  columns)
    [ -z "$TABLE" ] && { echo "Error: --table required" >&2; exit 1; }
    SQL="SELECT c.column_name, c.data_type, c.column_default, c.is_nullable,
      COALESCE(pgd.description, '') AS comment
    FROM information_schema.columns c
      LEFT JOIN pg_catalog.pg_statio_all_tables st ON st.schemaname = c.table_schema AND st.relname = c.table_name
      LEFT JOIN pg_catalog.pg_description pgd ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
    WHERE c.table_schema = 'public' AND c.table_name = '${TABLE}' ORDER BY c.ordinal_position"
    ;;
  indexes)
    [ -z "$TABLE" ] && { echo "Error: --table required" >&2; exit 1; }
    SQL="SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = '${TABLE}'"
    ;;
  rls)
    if [ -n "$TABLE" ]; then
      SQL="SELECT policyname, cmd, permissive, roles, qual, with_check
        FROM pg_policies WHERE schemaname = 'public' AND tablename = '${TABLE}'"
    else
      SQL="SELECT tablename, policyname, cmd, roles, qual FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname"
    fi
    ;;
  count)
    [ -z "$TABLE" ] && { echo "Error: --table required" >&2; exit 1; }
    SQL="SELECT COUNT(*) AS total FROM \"${TABLE}\""
    ;;
  sample)
    [ -z "$TABLE" ] && { echo "Error: --table required" >&2; exit 1; }
    SQL="SELECT * FROM \"${TABLE}\" LIMIT ${LIMIT_N}"
    ;;
  "")
    # No action — use --sql
    if [ -z "$SQL" ]; then
      echo "Error: provide --sql or an action (tables, columns, indexes, rls, count, sample)" >&2
      exit 1
    fi
    ;;
  *)
    echo "Unknown action: $ACTION" >&2
    exit 1
    ;;
esac

exec_sql "$SQL" | jq .
