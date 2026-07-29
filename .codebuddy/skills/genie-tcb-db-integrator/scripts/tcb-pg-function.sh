#!/usr/bin/env bash
# tcb-pg-function.sh — Create, query, and manage PostgreSQL functions in TCB
# This script is RESTRICTED to LLM Agent use only.
#
# === Actions ===
#
# CREATE a function:
#   bash tcb-pg-function.sh --project-dir /workspace create \
#     --name search_items --args "keyword text" --returns "SETOF items" \
#     --language sql --volatility STABLE \
#     --comment "Search items by keyword" \
#     --body "SELECT * FROM items WHERE title ILIKE '%' || keyword || '%';"
#
# LIST all functions with permissions:
#   bash tcb-pg-function.sh --project-dir /workspace list
#
# SHOW details for a specific function:
#   bash tcb-pg-function.sh --project-dir /workspace show --name search_items
#
# GRANT execute permission:
#   bash tcb-pg-function.sh --project-dir /workspace grant --name search_items --args "keyword text" --role authenticated
#
# REVOKE execute permission:
#   bash tcb-pg-function.sh --project-dir /workspace revoke --name search_items --args "keyword text" --role PUBLIC
#
# SET SECURITY DEFINER (bypasses RLS, auto-resolves args if --args omitted):
#   bash tcb-pg-function.sh --project-dir /workspace set-definer --name get_stats
#
# SET SECURITY INVOKER (default, RLS enforced, auto-resolves args if --args omitted):
#   bash tcb-pg-function.sh --project-dir /workspace set-invoker --name get_stats
#
# DROP a function (auto-resolves args if --args omitted):
#   bash tcb-pg-function.sh --project-dir /workspace drop --name old_function
#
# RENAME a function:
#   bash tcb-pg-function.sh --project-dir /workspace rename --name old_name --new-name new_name
#
# UPDATE comment:
#   bash tcb-pg-function.sh --project-dir /workspace comment --name search_items --comment "New description"
#
# VIEW source code only:
#   bash tcb-pg-function.sh --project-dir /workspace source --name search_items
#
# Prerequisites:
#   - /workspace/.env.tcb must exist with CLOUDBASE_ENV_ID
#   - auth-proxy must be running (tcb-env.auth-proxy.local)

set -euo pipefail

PROJECT_DIR="/workspace"
ACTION=""
FUNC_NAME=""
FUNC_ARGS=""
FUNC_RETURNS="void"
FUNC_LANGUAGE="sql"
FUNC_VOLATILITY=""
FUNC_BODY=""
FUNC_COMMENT=""
SECURITY_DEFINER=false
ROLE=""
NEW_NAME=""

# Parse --project-dir first, then action, then action-specific flags
while [[ $# -gt 0 ]]; do
  case $1 in
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    create|list|show|grant|revoke|set-definer|set-invoker|drop|rename|comment|source)
      ACTION="$1"; shift ;;
    --name) FUNC_NAME="$2"; shift 2 ;;
    --args) FUNC_ARGS="$2"; shift 2 ;;
    --returns) FUNC_RETURNS="$2"; shift 2 ;;
    --language) FUNC_LANGUAGE="$2"; shift 2 ;;
    --volatility) FUNC_VOLATILITY="$2"; shift 2 ;;
    --body) FUNC_BODY="$2"; shift 2 ;;
    --comment) FUNC_COMMENT="$2"; shift 2 ;;
    --security-definer) SECURITY_DEFINER=true; shift ;;
    --role) ROLE="$2"; shift 2 ;;
    --new-name) NEW_NAME="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$PROJECT_DIR" ] || [ -z "$ACTION" ]; then
  echo "Usage: tcb-pg-function.sh --project-dir <path> <action> [options]" >&2
  echo "  Actions: create, list, show, source, grant, revoke, set-definer, set-invoker, rename, comment, drop" >&2
  exit 1
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
  # Capture both response body and HTTP status code
  result=$(curl -sS -w '\n%{http_code}' -X POST "http://tcb-env.auth-proxy.local/pg/query" \
    -H "Content-Type: application/json" \
    -d "{\"sql_b64\": \"${sql_b64}\", \"mode\": \"migrate\"}" 2>&1)
  http_code=$(echo "$result" | tail -1)
  result=$(echo "$result" | sed '$d')

  # Check HTTP status code
  if [ "$http_code" != "200" ] && [ "$http_code" != "000" ]; then
    echo "Error: HTTP $http_code — $result" >&2
    return 1
  fi

  # Check for error fields in JSON response
  if echo "$result" | jq -e '.error // .code // .message' >/dev/null 2>&1; then
    local err_msg
    err_msg=$(echo "$result" | jq -r '.error // .message // "Unknown error"')
    # TCB returns {"code": "DATABASE_...", "message": "..."} on SQL errors
    if echo "$result" | jq -e '.code' >/dev/null 2>&1; then
      local code
      code=$(echo "$result" | jq -r '.code')
      echo "Error: [$code] $err_msg" >&2
      return 1
    fi
  fi
  echo "$result"
}

args_clause() {
  if [ -n "$FUNC_ARGS" ]; then echo "(${FUNC_ARGS})"; else echo "()"; fi
}

# Resolve full function signature from pg_catalog when --args not provided.
# PostgreSQL identifies functions by name + argument types, so we need the full signature.
resolve_func_signature() {
  local name="$1"
  if [ -n "$FUNC_ARGS" ]; then
    echo "${name}(${FUNC_ARGS})"
    return
  fi
  # Query pg_catalog for the function's argument types
  local result
  result=$(exec_sql "SELECT pg_get_function_arguments(p.oid) AS args FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = '${name}' LIMIT 1" 2>/dev/null)
  local args
  args=$(echo "$result" | jq -r '.[0].args // empty' 2>/dev/null)
  if [ -n "$args" ]; then
    echo "${name}(${args})"
  else
    # Fallback: no args or function not found — use empty parens
    echo "${name}()"
  fi
}

case "$ACTION" in

  create)
    [ -z "$FUNC_NAME" ] || [ -z "$FUNC_BODY" ] && { echo "Error: --name and --body required for create" >&2; exit 1; }

    VOL=""
    [ -n "$FUNC_VOLATILITY" ] && VOL=" $FUNC_VOLATILITY"
    SEC=""
    [ "$SECURITY_DEFINER" = true ] && SEC=" SECURITY DEFINER"

    if [ "$FUNC_LANGUAGE" = "plpgsql" ]; then
      SQL="CREATE OR REPLACE FUNCTION ${FUNC_NAME}$(args_clause) RETURNS ${FUNC_RETURNS} AS \$\$ BEGIN ${FUNC_BODY} END; \$\$ LANGUAGE ${FUNC_LANGUAGE}${VOL}${SEC}"
    else
      SQL="CREATE OR REPLACE FUNCTION ${FUNC_NAME}$(args_clause) RETURNS ${FUNC_RETURNS} AS \$\$ ${FUNC_BODY} \$\$ LANGUAGE ${FUNC_LANGUAGE}${VOL}${SEC}"
    fi

    echo "Creating function: ${FUNC_NAME}..."
    exec_sql "$SQL" > /dev/null
    echo "OK: Function ${FUNC_NAME} created"

    if [ -n "$FUNC_COMMENT" ]; then
      FUNC_SIG=$(resolve_func_signature "$FUNC_NAME")
      exec_sql "COMMENT ON FUNCTION ${FUNC_SIG} IS '${FUNC_COMMENT}'" > /dev/null
      echo "OK: Comment added"
    fi
    ;;

  list)
    SQL="SELECT
      p.proname AS name,
      CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
      CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' WHEN 'v' THEN 'VOLATILE' END AS volatility,
      l.lanname AS language,
      pg_catalog.format_type(p.prorettype, NULL) AS returns,
      pg_get_function_arguments(p.oid) AS arguments,
      COALESCE(d.description, '') AS description,
      COALESCE((
        SELECT string_agg(
          CASE WHEN acl_item::text LIKE '=%' THEN 'PUBLIC'
          ELSE split_part(acl_item::text, '=', 1) END, ', '
        ) FROM unnest(p.proacl) AS acl_item WHERE acl_item::text LIKE '%X%'
      ), CASE WHEN p.proacl IS NULL THEN 'PUBLIC (default)' ELSE 'NONE' END) AS execute_roles
    FROM pg_proc p
      LEFT JOIN pg_namespace n ON p.pronamespace = n.oid
      LEFT JOIN pg_language l ON p.prolang = l.oid
      LEFT JOIN pg_description d ON p.oid = d.objoid AND d.classoid = 'pg_proc'::regclass
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND l.lanname IN ('sql', 'plpgsql') AND p.proname NOT LIKE 'guard_%'
    ORDER BY p.proname"
    exec_sql "$SQL" | jq .
    ;;

  show)
    [ -z "$FUNC_NAME" ] && { echo "Error: --name required" >&2; exit 1; }
    SQL="SELECT
      p.proname AS name,
      CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security,
      CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' WHEN 'v' THEN 'VOLATILE' END AS volatility,
      l.lanname AS language,
      pg_catalog.format_type(p.prorettype, NULL) AS returns,
      pg_get_function_arguments(p.oid) AS arguments,
      COALESCE(p.prosrc, '') AS source,
      COALESCE(d.description, '') AS description,
      p.proacl::text AS raw_acl,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can_execute
    FROM pg_proc p
      LEFT JOIN pg_namespace n ON p.pronamespace = n.oid
      LEFT JOIN pg_language l ON p.prolang = l.oid
      LEFT JOIN pg_description d ON p.oid = d.objoid AND d.classoid = 'pg_proc'::regclass
    WHERE n.nspname = 'public' AND p.proname = '${FUNC_NAME}' LIMIT 1"
    exec_sql "$SQL" | jq .
    ;;

  grant)
    [ -z "$FUNC_NAME" ] || [ -z "$ROLE" ] && { echo "Error: --name and --role required" >&2; exit 1; }
    exec_sql "GRANT EXECUTE ON FUNCTION ${FUNC_NAME}$(args_clause) TO ${ROLE}" > /dev/null
    echo "OK: Granted EXECUTE on ${FUNC_NAME} to ${ROLE}"
    ;;

  revoke)
    [ -z "$FUNC_NAME" ] || [ -z "$ROLE" ] && { echo "Error: --name and --role required" >&2; exit 1; }
    exec_sql "REVOKE ALL ON FUNCTION ${FUNC_NAME}$(args_clause) FROM ${ROLE}" > /dev/null
    echo "OK: Revoked EXECUTE on ${FUNC_NAME} from ${ROLE}"
    ;;

  set-definer)
    [ -z "$FUNC_NAME" ] && { echo "Error: --name required" >&2; exit 1; }
    FUNC_SIG=$(resolve_func_signature "$FUNC_NAME")
    exec_sql "ALTER FUNCTION ${FUNC_SIG} SECURITY DEFINER" > /dev/null
    echo "OK: ${FUNC_NAME} set to SECURITY DEFINER (bypasses RLS)"
    ;;

  set-invoker)
    [ -z "$FUNC_NAME" ] && { echo "Error: --name required" >&2; exit 1; }
    FUNC_SIG=$(resolve_func_signature "$FUNC_NAME")
    exec_sql "ALTER FUNCTION ${FUNC_SIG} SECURITY INVOKER" > /dev/null
    echo "OK: ${FUNC_NAME} set to SECURITY INVOKER (RLS enforced)"
    ;;

  drop)
    [ -z "$FUNC_NAME" ] && { echo "Error: --name required" >&2; exit 1; }
    FUNC_SIG=$(resolve_func_signature "$FUNC_NAME")
    exec_sql "DROP FUNCTION IF EXISTS ${FUNC_SIG}" > /dev/null
    echo "OK: Function ${FUNC_NAME} dropped"
    ;;

  rename)
    [ -z "$FUNC_NAME" ] || [ -z "$NEW_NAME" ] && { echo "Error: --name and --new-name required" >&2; exit 1; }
    FUNC_SIG=$(resolve_func_signature "$FUNC_NAME")
    exec_sql "ALTER FUNCTION ${FUNC_SIG} RENAME TO ${NEW_NAME}" > /dev/null
    echo "OK: Function renamed from ${FUNC_NAME} to ${NEW_NAME}"
    ;;

  comment)
    [ -z "$FUNC_NAME" ] || [ -z "$FUNC_COMMENT" ] && { echo "Error: --name and --comment required" >&2; exit 1; }
    FUNC_SIG=$(resolve_func_signature "$FUNC_NAME")
    exec_sql "COMMENT ON FUNCTION ${FUNC_SIG} IS '${FUNC_COMMENT}'" > /dev/null
    echo "OK: Comment updated for ${FUNC_NAME}"
    ;;

  source)
    [ -z "$FUNC_NAME" ] && { echo "Error: --name required" >&2; exit 1; }
    SQL="SELECT p.prosrc AS source FROM pg_proc p
      LEFT JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = '${FUNC_NAME}' LIMIT 1"
    exec_sql "$SQL" | jq -r '.[0].source // "Function not found"'
    ;;

  *)
    echo "Unknown action: $ACTION" >&2
    exit 1
    ;;
esac
