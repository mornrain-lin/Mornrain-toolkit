/**
 * CloudBase Database Client
 *
 * Provides the database client using CloudBase JS SDK's rdb() API (PostgREST-based).
 * RLS (Row Level Security) enforces per-user data isolation at the database level — no backend needed.
 *
 * Roles:
 *   - anon: unauthenticated users (accessKey only)
 *   - authenticated: logged-in users (access_token from TCB Auth), auth.uid() available in RLS
 *
 * Prerequisites:
 *   - @cloudbase/js-sdk installed (done by ensure-cloudbase-env.sh)
 *   - .env with VITE_CLOUDBASE_ENV_ID, VITE_CLOUDBASE_REGION, VITE_CLOUDBASE_PUBLISH_KEY
 */

import cloudbase from '@cloudbase/js-sdk'

const app = cloudbase.init({
  env: import.meta.env.VITE_CLOUDBASE_ENV_ID,
  region: import.meta.env.VITE_CLOUDBASE_REGION || 'ap-shanghai',
  accessKey: import.meta.env.VITE_CLOUDBASE_PUBLISH_KEY,
})

/**
 * Database client — use for all CRUD operations.
 * IMPORTANT: must pass { database: 'public' } to avoid SDK using envId as schema.
 */
export const db = app.rdb({ database: 'public' })

/** Auth client — use to check login state */
export const auth = app.auth()

export default app

// ============================================================================
// DEMO: Query (SELECT)
// ============================================================================

/**
 * List published items (public, no login needed if RLS allows anon SELECT)
 */
export async function demoListPublished() {
  const { data, error } = await db
    .from('items')
    .select('id, title, created_at')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) throw new Error(error.message)
  return data // Array<{ id, title, created_at }>
}

/**
 * List items with multiple filters
 */
export async function demoListWithFilters() {
  const { data, error } = await db
    .from('items')
    .select('*')
    .gte('created_at', '2024-01-01')         // created on or after 2024
    .ilike('title', '%search term%')          // case-insensitive title contains
    .in('status', ['published', 'featured'])  // status is one of these
    .neq('user_id', 'some-user-id')           // exclude a specific user
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(error.message)
  return data
}

/**
 * List items with OR conditions
 */
export async function demoListWithOr() {
  const { data, error } = await db
    .from('items')
    .select('*')
    .or('status.eq.published,status.eq.featured')  // status = published OR featured
    .order('id', { ascending: true })

  if (error) throw new Error(error.message)
  return data
}

/**
 * Get single item by ID
 */
export async function demoGetById(id: number) {
  const { data, error } = await db
    .from('items')
    .select('*')
    .eq('id', id)
    .single()   // returns object instead of array, errors if not exactly 1 row

  if (error) throw new Error(error.message)
  return data // { id, title, content, ... }
}

/**
 * Get single item that may not exist (returns null if not found)
 */
export async function demoGetByIdMaybe(id: number) {
  const { data, error } = await db
    .from('items')
    .select('*')
    .eq('id', id)
    .maybeSingle()  // returns null if 0 rows, object if 1, error if >1

  if (error) throw new Error(error.message)
  return data // { ... } | null
}

/**
 * Paginated query with total count
 */
export async function demoListPaginated(page: number, pageSize: number) {
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, count, error } = await db
    .from('items')
    .select('*', { count: 'exact' })   // count: 'exact' returns total row count
    .order('created_at', { ascending: false })
    .range(from, to)                    // 0-based inclusive range

  if (error) throw new Error(error.message)
  return {
    items: data,        // current page rows
    total: count ?? 0,  // total row count (for pagination UI)
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  }
}

/**
 * Get only count (no data returned)
 */
export async function demoGetCount() {
  const { count, error } = await db
    .from('items')
    .select('*', { count: 'exact', head: true })  // head: true = no data, count only

  if (error) throw new Error(error.message)
  return count // number
}

/**
 * Select specific columns only
 */
export async function demoSelectColumns() {
  const { data, error } = await db
    .from('items')
    .select('id, title, status')  // only these columns returned

  if (error) throw new Error(error.message)
  return data
}

/**
 * Query with foreign key join (items has category_id → categories)
 */
export async function demoJoinQuery() {
  const { data, error } = await db
    .from('items')
    .select(`
      id,
      title,
      created_at,
      category:categories(id, name)
    `)
    .eq('status', 'published')

  if (error) throw new Error(error.message)
  return data // Array<{ id, title, created_at, category: { id, name } }>
}

/**
 * Nested join (categories → items → users)
 */
export async function demoNestedJoin() {
  const { data, error } = await db
    .from('categories')
    .select(`
      name,
      items(
        title,
        user:users(name, email)
      )
    `)

  if (error) throw new Error(error.message)
  return data
}

/**
 * Full-text search
 */
export async function demoTextSearch(query: string) {
  const { data, error } = await db
    .from('items')
    .select('*')
    .textSearch('content', query, { type: 'websearch', config: 'simple' })

  if (error) throw new Error(error.message)
  return data
}

/**
 * Check for NULL values
 */
export async function demoNullFilter() {
  // Items where deleted_at IS NULL (not deleted)
  const { data: active, error: e1 } = await db
    .from('items')
    .select('*')
    .is('deleted_at', null)

  // Items where deleted_at IS NOT NULL (soft-deleted)
  const { data: deleted, error: e2 } = await db
    .from('items')
    .select('*')
    .not('deleted_at', 'is', null)

  return { active, deleted }
}

// ============================================================================
// DEMO: Insert (CREATE)
// ============================================================================

/**
 * Insert a single row (user_id auto-filled by DEFAULT auth.uid() in table definition)
 */
export async function demoInsertOne() {
  // NOTE: Do NOT chain .select() after .insert() — TCB PG REST API returns 406.
  // user_id is auto-filled by DEFAULT auth.uid()
  const { error } = await db
    .from('items')
    .insert({
      title: 'My New Item',
      content: 'Hello world',
      status: 'draft',
    })

  if (error) throw new Error(error.message)
}

/**
 * Batch insert multiple rows
 */
export async function demoInsertBatch() {
  const { error } = await db
    .from('items')
    .insert([
      { title: 'Item A', content: 'Content A', status: 'draft' },
      { title: 'Item B', content: 'Content B', status: 'published' },
      { title: 'Item C', content: 'Content C', status: 'draft' },
    ])

  if (error) throw new Error(error.message)
}

// ============================================================================
// DEMO: Update (PATCH)
// ============================================================================

/**
 * Update a single row by ID (RLS: only owner can update via USING user_id = auth.uid())
 */
export async function demoUpdateById(id: number) {
  const { error } = await db
    .from('items')
    .update({
      title: 'Updated Title',
      status: 'published',
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

/**
 * Update multiple rows matching a filter
 */
export async function demoUpdateBatch() {
  const { error } = await db
    .from('items')
    .update({ status: 'archived' })
    .eq('status', 'draft')
    .lt('created_at', '2024-01-01')  // archive old drafts

  if (error) throw new Error(error.message)
}

// ============================================================================
// DEMO: Delete (DELETE)
// ============================================================================

/**
 * Delete a single row by ID (RLS: only owner can delete via USING user_id = auth.uid())
 */
export async function demoDeleteById(id: number) {
  const { error } = await db
    .from('items')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

/**
 * Delete rows matching a filter
 */
export async function demoDeleteByFilter() {
  const { error } = await db
    .from('items')
    .delete()
    .eq('status', 'archived')
    .lt('created_at', '2023-01-01')  // delete old archived items

  if (error) throw new Error(error.message)
}

// ============================================================================
// RPC — Call PostgreSQL Functions from Frontend
// ============================================================================
//
// IMPORTANT: @cloudbase/js-sdk@3.x does NOT have db.rpc() method.
// Use the rpc() helper below which calls TCB PG REST API directly via HTTP.
//
// Step 1: LLM creates function:
//   bash tcb-pg-function.sh --project-dir /workspace create \
//     --name search_items --args "keyword text" --returns "SETOF items" \
//     --language sql --volatility STABLE \
//     --body "SELECT * FROM items WHERE title ILIKE '%' || keyword || '%';"
//
// Step 2: Frontend calls the function:
//   const data = await rpc('search_items', { keyword: 'hello' })

const TCB_RPC_BASE = `https://${import.meta.env.VITE_CLOUDBASE_ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest/rpc`
const PUBLISH_KEY = import.meta.env.VITE_CLOUDBASE_PUBLISH_KEY || ''

/**
 * Get access_token from TCB session for RPC calls.
 * Returns user's access_token if logged in, otherwise PUBLISH_KEY (anon role).
 * TCB PG REST RPC endpoint requires Authorization header on every request —
 * even anonymous calls must use PUBLISH_KEY as Bearer token.
 */
async function getRpcToken(): Promise<string> {
  try {
    const { data, error } = await (auth as any).getSession()
    if (error || !data?.session?.access_token) return PUBLISH_KEY
    if (data.session.scope === 'accessKey') return PUBLISH_KEY
    return data.session.access_token
  } catch {
    return PUBLISH_KEY
  }
}

/**
 * Call a PostgreSQL function via TCB PG REST RPC endpoint.
 *
 * @param functionName - Name of the PostgreSQL function
 * @param params - Function arguments as key-value pairs
 * @param options - Optional: select, order, limit, offset for result filtering
 * @returns The function result (parsed JSON)
 *
 * @example
 * // Simple call
 * const result = await rpc('add_numbers', { a: 1, b: 2 })
 * // → 3
 *
 * // Function returning rows with filters
 * const items = await rpc('search_items', { keyword: 'hello' }, {
 *   select: 'id,title',
 *   order: 'created_at.desc',
 *   limit: 10,
 * })
 *
 * // Stats function
 * const stats = await rpc('get_item_stats')
 * // → { total: 42, latest: '2026-04-23T...' }
 */
export async function rpc<T = any>(
  functionName: string,
  params?: Record<string, any>,
  options?: { select?: string; order?: string; limit?: number; offset?: number }
): Promise<T> {
  const token = await getRpcToken()

  const qs = new URLSearchParams()
  if (options?.select) qs.set('select', options.select)
  if (options?.order) qs.set('order', options.order)
  if (options?.limit !== undefined) qs.set('limit', String(options.limit))
  if (options?.offset !== undefined) qs.set('offset', String(options.offset))

  const queryStr = qs.toString()
  const url = `${TCB_RPC_BASE}/${functionName}${queryStr ? `?${queryStr}` : ''}`

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(params || {}),
  })

  if (!resp.ok) {
    const errorText = await resp.text()
    throw new Error(`RPC ${functionName} failed (${resp.status}): ${errorText}`)
  }

  return resp.json()
}

// ============================================================================
// DEMO: RPC Usage Examples (all use the rpc() helper above)
// ============================================================================

/**
 * Call a PostgreSQL function with parameters
 */
export async function demoRpcWithParams() {
  const result = await rpc<number>('add_numbers', { a: 1, b: 2 })
  return result // 3
}

/**
 * Call a function that returns table rows — filter/order/limit via options
 */
export async function demoRpcSearchItems(keyword: string) {
  return await rpc('search_items', { keyword }, {
    select: 'id,title,created_at',
    order: 'created_at.desc',
    limit: 10,
  })
}

/**
 * Call a stats function returning JSON
 */
export async function demoRpcStats() {
  return await rpc<{ total: number; latest: string }>('get_item_stats')
  // → { total: 42, latest: '2026-04-23T...' }
}

// ============================================================================
// DEMO: React Hook Pattern (recommended for components)
// ============================================================================

/**
 * Example: Custom hook for fetching paginated items
 *
 * Usage in a component:
 *   const { items, total, loading, error, refetch } = useItems(page, pageSize, filters)
 *
 * ```tsx
 * import { useState, useEffect, useCallback } from 'react'
 * import { db } from '@/lib/database'
 *
 * interface UseItemsOptions {
 *   page: number
 *   pageSize: number
 *   status?: string
 *   search?: string
 * }
 *
 * export function useItems({ page, pageSize, status, search }: UseItemsOptions) {
 *   const [items, setItems] = useState<any[]>([])
 *   const [total, setTotal] = useState(0)
 *   const [loading, setLoading] = useState(true)
 *   const [error, setError] = useState<string | null>(null)
 *
 *   const fetchItems = useCallback(async () => {
 *     setLoading(true)
 *     setError(null)
 *
 *     const from = (page - 1) * pageSize
 *     const to = from + pageSize - 1
 *
 *     let query = db.from('items').select('*', { count: 'exact' })
 *
 *     // Apply filters conditionally
 *     if (status) query = query.eq('status', status)
 *     if (search) query = query.ilike('title', `%${search}%`)
 *
 *     const { data, count, error: err } = await query
 *       .order('created_at', { ascending: false })
 *       .range(from, to)
 *
 *     if (err) {
 *       setError(err.message)
 *     } else {
 *       setItems(data ?? [])
 *       setTotal(count ?? 0)
 *     }
 *     setLoading(false)
 *   }, [page, pageSize, status, search])
 *
 *   useEffect(() => { fetchItems() }, [fetchItems])
 *
 *   return { items, total, loading, error, refetch: fetchItems }
 * }
 * ```
 */

// ============================================================================
// DEMO: Auth-Gated Operations
// ============================================================================

/**
 * Example: Check auth before write operation
 *
 * ```tsx
 * import { db } from '@/lib/database'
 * import { getAccessToken } from '@/lib/cloudbase'
 *
 * async function createItem(title: string, content: string) {
 *   // Check if user is logged in
 *   const token = await getAccessToken()
 *   if (!token) {
 *     throw new Error('Please log in to create items')
 *   }
 *
 *   // user_id is auto-filled by DEFAULT auth.uid() — no need to pass it
 *   // NOTE: Do NOT chain .select() after .insert() on TCB
 *   const { error } = await db
 *     .from('items')
 *     .insert({ title, content, status: 'draft' })
 *
 *   if (error) {
 *     if (error.code === 'PERMISSION_DENIED') {
 *       throw new Error('You do not have permission to create items')
 *     }
 *     throw new Error(`Failed to create item: ${error.message}`)
 *   }
 *
 *   return data?.[0]
 * }
 * ```
 */

// ============================================================================
// DEMO: Error Handling Patterns
// ============================================================================

/**
 * Common error codes from PG REST API:
 *
 *   401 — Not authenticated (need login)
 *   403 — RLS policy denied (e.g., trying to modify another user's data)
 *   404 — Table not found
 *   406 — Not Acceptable (wrong Accept header or schema)
 *   409 — Conflict (unique constraint violation)
 *   500 — Internal server error
 *
 * Example:
 * ```tsx
 * const { error } = await db.from('items').insert({ title: 'Test' })
 * if (error) {
 *   switch (error.code) {
 *     case 'PERMISSION_DENIED':
 *       toast.error('Please log in first')
 *       break
 *     case 'DATABASE_23505':  // unique_violation
 *       toast.error('This item already exists')
 *       break
 *     default:
 *       toast.error(`Error: ${error.message}`)
 *   }
 * }
 * ```
 */
