/**
 * TCB Auth Middleware for Express — Backend Authentication (JWKS + RS256)
 *
 * Verifies user identity by validating JWT signature using TCB's JWKS public keys.
 * No Server API Key needed — public keys are fetched from TCB's standard OIDC endpoint.
 *
 * How it works:
 *   1. Frontend logs in via TCB Auth (signInWithPassword, signInWithOtp, OAuth)
 *   2. Frontend gets access_token (JWT, 2-hour validity, signed with RS256)
 *   3. Frontend sends requests with: Authorization: Bearer <access_token>
 *   4. Backend middleware verifies JWT signature using RSA public key from JWKS endpoint
 *   5. If valid, req.user is populated; if invalid, 401 is returned
 *
 * Security:
 *   - JWT signature is verified using RSA public key (RS256 algorithm)
 *   - Public keys are fetched from TCB's JWKS endpoint and cached in memory (10 min)
 *   - Forged tokens without valid signature are rejected
 *   - Token expiration is automatically checked by jwt.verify()
 *
 * Usage:
 *   import { requireAuth, optionalAuth } from './auth-middleware'
 *
 *   // Protected route — requires login
 *   app.get('/api/profile', requireAuth, (req, res) => {
 *     res.json({ user: req.user })
 *   })
 *
 *   // Optional auth — populates req.user if token present, but doesn't block
 *   app.get('/api/items', optionalAuth, (req, res) => {
 *     if (req.user) { /* authenticated * / }
 *   })
 *
 * Dependencies:
 *   pnpm add jsonwebtoken jwks-rsa
 *   pnpm add -D @types/jsonwebtoken
 *
 * Environment:
 *   Reads CLOUDBASE_ENV_ID from /workspace/.env.tcb (auto-configured by ensure-cloudbase-env.sh)
 */

import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'
import { readFileSync, existsSync } from 'fs'

// ─── TCB Environment ───────────────────────────────────────────────

/** Read CLOUDBASE_ENV_ID from /workspace/.env.tcb (fallback for when dotenv isn't configured) */
function readEnvIdFromFile(): string {
  const envPath = '/workspace/.env.tcb'
  if (!existsSync(envPath)) return ''
  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const eqIdx = line.indexOf('=')
    if (eqIdx === -1) continue
    if (line.slice(0, eqIdx).trim() === 'CLOUDBASE_ENV_ID') {
      return line.slice(eqIdx + 1).trim()
    }
  }
  return ''
}

const TCB_ENV_ID = process.env.CLOUDBASE_ENV_ID || readEnvIdFromFile()
const TCB_BASE_URL = `https://${TCB_ENV_ID}.api.tcloudbasegateway.com`

// ─── JWKS Client ───────────────────────────────────────────────────

/**
 * JWKS client for fetching TCB RSA public keys.
 * Keys are cached in memory (10 min) and rate-limited (5 req/min).
 * Endpoint: https://{ENV_ID}.api.tcloudbasegateway.com/auth/v1/certs
 */
const client = jwksClient({
  jwksUri: `${TCB_BASE_URL}/auth/v1/certs`,
  cache: true,
  cacheMaxAge: 600_000, // 10 minutes
  rateLimit: true,
  jwksRequestsPerMinute: 5,
})

// ─── Types ─────────────────────────────────────────────────────────

/** TCB JWT payload structure (fields relevant to auth) */
interface TcbJwtPayload extends jwt.JwtPayload {
  email?: string
  phone?: string
  name?: string
  role?: string
  is_anonymous?: boolean
  provider?: string
  app_metadata?: { provider?: string }
  user_metadata?: { nickName?: string; name?: string; avatarUrl?: string }
}

/** Authenticated user info populated on req.user */
export interface AuthUser {
  id: string
  email: string
  phone: string
  name: string
  avatar_url: string
  provider: string
  role: string
  is_anonymous: boolean
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

// ─── Token Verification ────────────────────────────────────────────

/**
 * Verify access_token by validating JWT signature with JWKS public key.
 * Returns user info if valid, null if invalid.
 */
async function verifyToken(token: string): Promise<AuthUser | null> {
  if (!TCB_ENV_ID) {
    console.warn('[auth-middleware] CLOUDBASE_ENV_ID not set, cannot verify token')
    return null
  }

  try {
    // Decode header to get kid (key ID)
    const decoded = jwt.decode(token, { complete: true })
    if (!decoded || typeof decoded === 'string' || !decoded.header.kid) return null

    // Fetch RSA public key by kid (cached after first call)
    const signingKey = await client.getSigningKey(decoded.header.kid)
    const publicKey = signingKey.getPublicKey()

    // Verify signature + expiration
    const payload = jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as TcbJwtPayload
    if (typeof payload === 'string') return null

    // Filter out anonymous users — they have no meaningful identity
    const provider = payload.app_metadata?.provider || payload.provider || 'unknown'
    if (provider === 'anonymous' || payload.is_anonymous === true) return null
    if (!payload.email && !payload.phone) return null

    const meta = payload.user_metadata || {}

    return {
      id: payload.sub || '',
      email: payload.email || '',
      phone: payload.phone || '',
      name: meta.nickName || meta.name || payload.name || '',
      avatar_url: meta.avatarUrl || '',
      provider,
      role: payload.role || 'authenticated',
      is_anonymous: false,
    }
  } catch {
    return null
  }
}

// ─── Middleware ─────────────────────────────────────────────────────

/**
 * Middleware: Requires authentication.
 * Returns 401 if no valid token. Populates req.user on success.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required — no Authorization header' })
    return
  }

  const token = authHeader.slice(7).trim()
  if (!token) {
    res.status(401).json({ error: 'Authentication required — Bearer token is empty (check getAccessToken() call)' })
    return
  }

  const user = await verifyToken(token)
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  req.user = user
  next()
}

/**
 * Middleware: Optional authentication.
 * Populates req.user if valid token present, continues regardless.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const user = await verifyToken(token)
    if (user) req.user = user
  }
  next()
}

// ─── PG REST Types ─────────────────────────────────────────────────

/** Options for tcbQuery (SELECT) */
export interface TcbQueryOptions {
  /** Column selection, e.g. 'id,title,created_at' or '*' */
  select?: string
  /** PostgREST filters, e.g. { status: 'eq.published', price: 'gt.100' } */
  filter?: Record<string, string>
  /** Sort order, e.g. 'created_at.desc' or 'name.asc,id.desc' */
  order?: string
  limit?: number
  offset?: number
  /** Include total count in response headers (Prefer: count=exact) */
  count?: boolean
}

/** Options for tcbInsert (POST) */
export interface TcbInsertOptions {
  /** Return inserted rows (Prefer: return=representation) */
  returning?: boolean
  /** Upsert mode: 'merge' = ON CONFLICT DO UPDATE, 'ignore' = ON CONFLICT DO NOTHING */
  upsert?: 'merge' | 'ignore'
}

/** Response with count header parsed */
export interface TcbQueryResult<T = any> {
  data: T[]
  /** Total count (only present when count: true is requested) */
  count?: number
}

// ─── Low-Level Fetch ───────────────────────────────────────────────

/**
 * Low-level: forward user's token to any TCB API endpoint.
 * Prefer the typed helpers (tcbQuery, tcbInsert, etc.) for PG REST operations.
 */
export async function tcbFetchAsUser(
  req: Request,
  path: string,
  options?: { method?: string; body?: any; headers?: Record<string, string> }
): Promise<any> {
  if (!TCB_ENV_ID) {
    throw new Error('[auth-middleware] CLOUDBASE_ENV_ID not set, cannot call TCB API')
  }

  const resp = await fetch(`${TCB_BASE_URL}${path}`, {
    method: options?.method || 'GET',
    headers: {
      'Authorization': req.headers.authorization || '',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options?.headers,
    },
    ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
  })

  if (!resp.ok) {
    const error = await resp.text()
    throw new Error(`TCB API error ${resp.status}: ${error}`)
  }

  return resp.json()
}

// ─── PG REST Helpers ───────────────────────────────────────────────

const PG_REST_BASE = '/v1/rdb/rest'

/** Build PostgREST query string from filter object */
function buildFilterParams(filter?: Record<string, string>): string {
  if (!filter) return ''
  return Object.entries(filter)
    .map(([col, expr]) => `${encodeURIComponent(col)}=${encodeURIComponent(expr)}`)
    .join('&')
}

/**
 * Query rows from a table (SELECT). RLS enforced as the authenticated user.
 *
 * Usage:
 *   const { data, count } = await tcbQuery(req, 'items', {
 *     select: 'id,title,created_at',
 *     filter: { status: 'eq.published', price: 'gt.100' },
 *     order: 'created_at.desc',
 *     limit: 20,
 *     count: true,
 *   })
 */
export async function tcbQuery<T = any>(
  req: Request,
  table: string,
  options?: TcbQueryOptions
): Promise<TcbQueryResult<T>> {
  const params = new URLSearchParams()
  if (options?.select) params.set('select', options.select)
  if (options?.order) params.set('order', options.order)
  if (options?.limit !== undefined) params.set('limit', String(options.limit))
  if (options?.offset !== undefined) params.set('offset', String(options.offset))

  const filterStr = buildFilterParams(options?.filter)
  let qs = params.toString()
  if (filterStr) qs = qs ? `${qs}&${filterStr}` : filterStr

  const path = `${PG_REST_BASE}/${table}${qs ? `?${qs}` : ''}`
  const headers: Record<string, string> = {}
  if (options?.count) headers['Prefer'] = 'count=exact'

  if (!TCB_ENV_ID) {
    throw new Error('[auth-middleware] CLOUDBASE_ENV_ID not set, cannot call TCB API')
  }

  const resp = await fetch(`${TCB_BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      'Authorization': req.headers.authorization || '',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...headers,
    },
  })

  if (!resp.ok) {
    const error = await resp.text()
    throw new Error(`TCB API error ${resp.status}: ${error}`)
  }

  const data = await resp.json()

  // Parse count from Content-Range header: "0-19/42"
  let count: number | undefined
  if (options?.count) {
    const range = resp.headers.get('content-range')
    if (range) {
      const total = range.split('/')[1]
      if (total && total !== '*') count = parseInt(total, 10)
    }
  }

  return { data, count }
}

/**
 * Insert one or more rows into a table. RLS enforced.
 *
 * Usage:
 *   // Single row
 *   const rows = await tcbInsert(req, 'items', { title: 'New', status: 'draft' }, { returning: true })
 *
 *   // Batch insert
 *   await tcbInsert(req, 'items', [{ title: 'A' }, { title: 'B' }])
 *
 *   // Upsert (ON CONFLICT DO UPDATE)
 *   await tcbInsert(req, 'items', { id: 1, title: 'Updated' }, { upsert: 'merge', returning: true })
 */
export async function tcbInsert<T = any>(
  req: Request,
  table: string,
  data: Record<string, any> | Record<string, any>[],
  options?: TcbInsertOptions
): Promise<T[]> {
  const prefer: string[] = []
  if (options?.returning) prefer.push('return=representation')
  if (options?.upsert === 'merge') prefer.push('resolution=merge-duplicates')
  if (options?.upsert === 'ignore') prefer.push('resolution=ignore-duplicates')

  const headers: Record<string, string> = {}
  if (prefer.length > 0) headers['Prefer'] = prefer.join(', ')

  return tcbFetchAsUser(req, `${PG_REST_BASE}/${table}`, {
    method: 'POST',
    body: data,
    headers,
  })
}

/**
 * Update rows in a table matching filter. RLS enforced.
 * Filter is MANDATORY — PG REST returns 400 without it.
 *
 * Usage:
 *   await tcbUpdate(req, 'items', { status: 'published' }, { id: 'eq.123' })
 */
export async function tcbUpdate<T = any>(
  req: Request,
  table: string,
  data: Record<string, any>,
  filter: Record<string, string>,
  options?: { returning?: boolean }
): Promise<T[]> {
  const filterStr = buildFilterParams(filter)
  if (!filterStr) throw new Error('tcbUpdate requires a filter (WHERE condition is mandatory)')

  const headers: Record<string, string> = {}
  if (options?.returning) headers['Prefer'] = 'return=representation'

  return tcbFetchAsUser(req, `${PG_REST_BASE}/${table}?${filterStr}`, {
    method: 'PATCH',
    body: data,
    headers,
  })
}

/**
 * Delete rows from a table matching filter. RLS enforced.
 * Filter is MANDATORY — PG REST returns 400 without it.
 *
 * Usage:
 *   await tcbDelete(req, 'items', { id: 'eq.123' })
 *   const deleted = await tcbDelete(req, 'items', { status: 'eq.archived' }, { returning: true })
 */
export async function tcbDelete<T = any>(
  req: Request,
  table: string,
  filter: Record<string, string>,
  options?: { returning?: boolean }
): Promise<T[]> {
  const filterStr = buildFilterParams(filter)
  if (!filterStr) throw new Error('tcbDelete requires a filter (WHERE condition is mandatory)')

  const headers: Record<string, string> = {}
  if (options?.returning) headers['Prefer'] = 'return=representation'

  return tcbFetchAsUser(req, `${PG_REST_BASE}/${table}?${filterStr}`, {
    method: 'DELETE',
    headers,
  })
}

/**
 * Call a PostgreSQL function via RPC. RLS enforced.
 *
 * Usage:
 *   // Simple RPC
 *   const result = await tcbRpc(req, 'get_item_stats')
 *
 *   // RPC with parameters
 *   const items = await tcbRpc(req, 'search_items', { keyword: 'hello', limit_count: 10 })
 *
 *   // Chain PostgREST filters on RPC result
 *   const top5 = await tcbRpc(req, 'search_items', { keyword: 'hello' }, {
 *     select: 'id,title',
 *     order: 'created_at.desc',
 *     limit: 5,
 *   })
 */
export async function tcbRpc<T = any>(
  req: Request,
  functionName: string,
  params?: Record<string, any>,
  queryOptions?: { select?: string; order?: string; limit?: number; offset?: number }
): Promise<T> {
  const qs = new URLSearchParams()
  if (queryOptions?.select) qs.set('select', queryOptions.select)
  if (queryOptions?.order) qs.set('order', queryOptions.order)
  if (queryOptions?.limit !== undefined) qs.set('limit', String(queryOptions.limit))
  if (queryOptions?.offset !== undefined) qs.set('offset', String(queryOptions.offset))

  const queryStr = qs.toString()
  const path = `${PG_REST_BASE}/rpc/${functionName}${queryStr ? `?${queryStr}` : ''}`

  return tcbFetchAsUser(req, path, {
    method: 'POST',
    body: params || {},
  })
}
