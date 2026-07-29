/**
 * TCB Node SDK client — uses credentials from .env files or
 * .tcb_custom_login_key.json for createTicket (custom login).
 */
import cloudbase from '@cloudbase/node-sdk'
import { readFileSync, existsSync } from 'fs'

// Use absolute path — all Genie projects run under /workspace.
// This avoids ESM vs CJS compatibility issues (__dirname is undefined in ESM).
const PROJECT_ROOT = '/workspace'

function loadTcbEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  const envPath = `${PROJECT_ROOT}/.env.tcb`
  if (!existsSync(envPath)) return env
  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const eqIdx = line.indexOf('=')
    if (eqIdx === -1) continue
    const key = line.slice(0, eqIdx).trim()
    const value = line.slice(eqIdx + 1).trim()
    if (key) env[key] = value
  }
  return env
}

function loadCustomLoginKey(): { private_key_id: string; private_key: string; env_id: string } | null {
  const keyPath = `${PROJECT_ROOT}/.tcb_custom_login_key.json`
  if (!existsSync(keyPath)) return null
  try {
    return JSON.parse(readFileSync(keyPath, 'utf-8'))
  } catch {
    return null
  }
}

export const tcbEnv = loadTcbEnv()
const customLoginKey = loadCustomLoginKey()

const ENV_ID = tcbEnv.CLOUDBASE_ENV_ID || customLoginKey?.env_id || ''
const REGION = tcbEnv.CLOUDBASE_REGION || 'ap-shanghai'

const app = cloudbase.init({
  env: ENV_ID,
  region: REGION,
  ...(customLoginKey
    ? {
        credentials: {
          private_key_id: customLoginKey.private_key_id,
          private_key: customLoginKey.private_key,
          env_id: customLoginKey.env_id,
        },
      }
    : {
        accessKey: tcbEnv.CLOUDBASE_APIKEY || '',
      }),
})

export const auth = app.auth()
export default app
