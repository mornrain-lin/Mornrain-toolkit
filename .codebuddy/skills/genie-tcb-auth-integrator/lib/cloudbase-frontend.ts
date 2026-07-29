import cloudbase from '@cloudbase/js-sdk'

const ENV_ID = import.meta.env.VITE_CLOUDBASE_ENV_ID || ''
const REGION = import.meta.env.VITE_CLOUDBASE_REGION || 'ap-shanghai'
const PUBLISH_KEY = import.meta.env.VITE_CLOUDBASE_PUBLISH_KEY || ''

const app = cloudbase.init({
  env: ENV_ID,
  region: REGION,
  accessKey: PUBLISH_KEY,
  auth: { detectSessionInUrl: true },
})

export const auth = app.auth
export const db = app.database()
export default app

/**
 * Get the current user's access_token from TCB session.
 * Returns empty string if not logged in.
 *
 * CloudBase JS SDK v2 getSession() returns:
 *   { data: { session: { access_token, refresh_token, user }, user }, error }
 *
 * NOTE: The token is nested under data.session.access_token, NOT data.access_token.
 * Use this helper instead of manually calling getSession() to avoid path errors.
 */
export async function getAccessToken(): Promise<string> {
  try {
    const { data, error } = await (auth as any).getSession()
    if (error || !data?.session?.access_token) return ''
    // Filter out accessKey-scoped tokens (anonymous sessions)
    if (data.session.scope === 'accessKey') return ''
    return data.session.access_token
  } catch {
    return ''
  }
}
