#!/usr/bin/env bash
# ensure-cloudbase-env.sh (mini-program variant)
# Idempotent script to ensure CloudBase TCB environment credentials are available.
# Usage: bash ensure-cloudbase-env.sh [--project-dir <dir>] [--region <region>]

set -euo pipefail

PROJECT_DIR="."
AUTH_PROXY_HOST="tcb-env.auth-proxy.local"
REGION="ap-shanghai"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

cd "$PROJECT_DIR"

# --- Step 0: Check if .env.tcb already exists ---

if [ -f "/workspace/.env.tcb" ] && grep -q "CLOUDBASE_ENV_ID=" "/workspace/.env.tcb" 2>/dev/null; then
  echo "TCB environment already initialized (found /workspace/.env.tcb)"
  exit 0
fi

# --- Step 1: Create TCB environment via auth-proxy ---

# Build sandbox domain from environment variables
SPACE_KEY="${X_IDE_SPACE_KEY:-}"
PREVIEW_DOMAIN="${X_IDE_PREVIEW_DOMAIN:-}"
if [ -n "$SPACE_KEY" ] && [ -n "$PREVIEW_DOMAIN" ]; then
  SANDBOX_DOMAIN="55221-${SPACE_KEY}.e2b.${PREVIEW_DOMAIN}"
else
  SANDBOX_DOMAIN="${SANDBOX_DOMAIN:-localhost}"
fi

echo "Creating TCB environment for domain: $SANDBOX_DOMAIN ..."

# 捕获 HTTP 状态码 + body（不用 -f，以便读取 429 限流响应的 display）
HTTP_RESP=$(curl -sS -w '\n%{http_code}' -X POST \
  "http://${AUTH_PROXY_HOST}/create" \
  -H "Content-Type: application/json" \
  -d "{
    \"domain\": \"${SANDBOX_DOMAIN}\",
    \"region\": \"${REGION}\"
  }" 2>&1) || {
  echo "ERROR: Failed to reach auth-proxy at $AUTH_PROXY_HOST"
  echo "Response: $HTTP_RESP"
  exit 1
}
HTTP_CODE=$(printf '%s' "$HTTP_RESP" | tail -n1)
RESPONSE=$(printf '%s' "$HTTP_RESP" | sed '$d')

# 配额限流（429）：哨兵输出标准化错误结构 + 退出码 42（约定 42=限流，上层不重试转结构化提示）
if [ "$HTTP_CODE" = "429" ]; then
  echo "##GENIE_TCB_ERROR##${RESPONSE}##END##"
  echo "TCB environment quota exceeded (HTTP 429). See structured error above." >&2
  exit 42
fi

# 其他非 2xx：普通失败
if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
  echo "ERROR: create TCB environment failed (HTTP $HTTP_CODE)"
  echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
  exit 1
fi

ENV_ID=$(echo "$RESPONSE" | jq -r '.envId // .data.envId // empty')
RESP_REGION=$(echo "$RESPONSE" | jq -r '.region // .data.region // "ap-shanghai"')
CREATED=$(echo "$RESPONSE" | jq -r '.created // .data.created // "unknown"')

if [ -z "$ENV_ID" ]; then
  echo "ERROR: Failed to obtain TCB environment"
  echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
  exit 1
fi

if [ "$CREATED" = "true" ]; then
  echo "TCB environment created: $ENV_ID"
else
  echo "TCB environment already exists: $ENV_ID"
fi

# --- Step 2: Read credentials from .env.tcb (written by api-server) ---

if [ ! -f "/workspace/.env.tcb" ]; then
  echo "WARNING: /workspace/.env.tcb not found after creation"
fi

PUBLISHABLE_KEY=""
if [ -f "/workspace/.env.tcb" ]; then
  PUBLISHABLE_KEY=$(grep "CLOUDBASE_PUBLISH_KEY=" /workspace/.env.tcb 2>/dev/null | cut -d= -f2- || true)
fi

# --- Step 3: Install dependencies ---

if [ -f "package.json" ]; then
  echo "Installing @cloudbase/js-sdk and @cloudbase/adapter-taro..."
  npm install @cloudbase/js-sdk@3.3.2 @cloudbase/adapter-taro --save
fi

echo ""
echo "CloudBase Environment Setup Complete:"
echo "  ENV_ID:  ${ENV_ID}"
echo "  Region:  ${RESP_REGION}"
echo "  Publish Key: ${PUBLISHABLE_KEY:0:20}..."
echo ""
echo "Copy SDK files and replace placeholders with these values."
echo "See SKILL.md section '2. Copy SDK Files and Fill in Credentials' for details."
