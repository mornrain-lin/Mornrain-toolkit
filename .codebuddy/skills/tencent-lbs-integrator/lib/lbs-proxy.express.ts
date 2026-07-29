/**
 * 腾讯位置服务 (LBS) - 后端代理路由（Express）
 *
 * 为什么需要它（面向 Genie 小程序 = H5 预览 + weapp 发布）：
 * - H5 预览：前端直连 apis.map.qq.com 会被 CORS 拦截，且 LBS 域名白名单在沙箱动态域名下难配置
 * - weapp 发布：直连需配「合法域名」且暴露 Key
 * 用后端透传代理后：前端只请求同源 /api/lbs/*，H5 与 weapp 两个运行时都无 CORS、无需域名白名单，
 * 且 Key 只存在于服务端环境变量，不暴露在前端。
 *
 * 安全防护（纵深防御，均为进程内实现，零额外依赖）：
 * - L1 端点白名单：只放行既定的 /ws/* 端点，防越权/路径遍历
 * - L2 Origin/Referer 白名单：只放行本 app 域名来源（未配置则放行，便于 dev/沙箱）
 * - L3 每 IP 限流：压制单源刷量（NODE_ENV=development 下豁免，不影响调试）
 * - L4 相同参数缓存：重复查询直接返回，不打腾讯、不计入限流（保护配额与调试体验）
 * 注意：L2 的来源头可伪造、L3 的 IP 可轮换，二者只用于收敛滥用规模；
 *      费用硬上限请在腾讯 LBS 控制台为本 app 配「独立 Key + 每日配额上限 + 监控告警」。
 *
 * 使用方式（在生成项目的后端里）：
 *   import { lbsProxyRouter } from './modules/lbs-proxy'   // 拷贝本文件到 src/modules/
 *   app.use(`${env.API_PREFIX}/lbs`, lbsProxyRouter)       // 挂到 /api/lbs
 * 并在后端环境变量中配置：TENCENT_LBS_KEY=<服务端 WebService Key>
 *
 * 可选环境变量（均有默认值）：
 *   LBS_ALLOWED_ORIGINS      逗号分隔的允许来源域名，空=不校验（默认）
 *   LBS_RATE_LIMIT_WINDOW_MS 限流窗口毫秒，默认 60000
 *   LBS_RATE_LIMIT_MAX       窗口内每 IP 上限，默认 60
 *   LBS_CACHE_TTL_MS         缓存有效期毫秒，默认 300000
 *   LBS_CACHE_MAX_ENTRIES    缓存条目上限，默认 500
 */

import { Router, Request, Response, NextFunction } from 'express'

/** 腾讯 WebService 固定基地址（host 固定，杜绝 SSRF：不接受任何用户可控的 host） */
const TENCENT_LBS_BASE = 'https://apis.map.qq.com'

/**
 * [L1] 允许代理的端点白名单（精确匹配，防止路径遍历 / 打到非预期接口）。
 * 与前端 TencentLBSClient 使用的 endpoint 保持一致。
 */
const ALLOWED_ENDPOINTS = new Set<string>([
  '/ws/geocoder/v1/',   // 地址解析 / 逆地址解析
  '/ws/place/v1/search', // 地点搜索
  '/ws/location/v1/ip',  // IP 定位
])

// ============ 配置（从 env 读取，均有默认值）============

function envNum(name: string, def: number): number {
  const v = Number(process.env[name])
  return Number.isFinite(v) && v > 0 ? v : def
}

const RATE_WINDOW_MS = envNum('LBS_RATE_LIMIT_WINDOW_MS', 60000)
const RATE_MAX = envNum('LBS_RATE_LIMIT_MAX', 60)
const CACHE_TTL_MS = envNum('LBS_CACHE_TTL_MS', 300000)
const CACHE_MAX_ENTRIES = envNum('LBS_CACHE_MAX_ENTRIES', 500)
const ALLOWED_ORIGINS = (process.env.LBS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const IS_DEV = (process.env.NODE_ENV || 'development') !== 'production'

// ============ 工具 ============

/** 稳定序列化查询参数（排序 + 剔除 key），用于缓存键与上游转发 */
function collectQuery(req: Request): [string, string][] {
  const entries: [string, string][] = []
  Object.entries(req.query).forEach(([k, v]) => {
    if (k === 'key') return // 前端不应传 key，统一由服务端注入
    if (typeof v === 'string') entries.push([k, v])
    else if (Array.isArray(v)) v.forEach((item) => typeof item === 'string' && entries.push([k, item]))
  })
  return entries
}

// ============ [L2] Origin/Referer 白名单 ============

function checkOrigin(req: Request, res: Response, next: NextFunction) {
  if (ALLOWED_ORIGINS.length === 0) return next() // 未配置 → 放行（dev / 沙箱动态域名）
  const source = req.get('origin') || req.get('referer')
  if (!source) return next() // weapp 无 Origin/Referer，无法据此判定，交由 L3 兜底
  try {
    const host = new URL(source).host
    if (ALLOWED_ORIGINS.some((a) => host === a || host.endsWith(`.${a}`))) return next()
  } catch {
    /* 非法来源头，落到下方 403 */
  }
  return res.status(403).json({ status: -403, message: '请求来源未被授权' })
}

// ============ [L4] 相同参数缓存（命中不计限流、不打腾讯）============

interface CacheEntry {
  expireAt: number
  body: unknown
}
const cache = new Map<string, CacheEntry>()

function cacheKeyOf(req: Request): string {
  const q = collectQuery(req)
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  return `${req.path}?${q}`
}

function cacheLookup(req: Request, res: Response, next: NextFunction) {
  const key = cacheKeyOf(req)
  const hit = cache.get(key)
  if (hit && Date.now() < hit.expireAt) {
    res.set('X-LBS-Cache', 'HIT')
    return res.json(hit.body)
  }
  if (hit) cache.delete(key)
  ;(req as Request & { _lbsCacheKey?: string })._lbsCacheKey = key
  return next()
}

function cacheStore(key: string, body: unknown) {
  const now = Date.now()
  if (cache.size >= CACHE_MAX_ENTRIES) {
    for (const [k, v] of cache) if (now >= v.expireAt) cache.delete(k) // 先清过期
    if (cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value // 仍满则驱逐最早插入项
      if (oldest) cache.delete(oldest)
    }
  }
  cache.set(key, { expireAt: now + CACHE_TTL_MS, body })
}

// ============ [L3] 每 IP 限流（dev 豁免）============

interface RateBucket {
  count: number
  resetAt: number
}
const rateMap = new Map<string, RateBucket>()

function rateLimit(req: Request, res: Response, next: NextFunction) {
  if (IS_DEV) return next() // 开发环境豁免，不影响调试

  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  const now = Date.now()

  if (rateMap.size > 10000) {
    for (const [k, v] of rateMap) if (now >= v.resetAt) rateMap.delete(k) // 防表膨胀
  }

  let bucket = rateMap.get(ip)
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS }
    rateMap.set(ip, bucket)
  }

  bucket.count++
  if (bucket.count > RATE_MAX) {
    const retry = Math.ceil((bucket.resetAt - now) / 1000)
    res.set('Retry-After', String(retry))
    return res.status(429).json({ status: -429, message: `请求过于频繁，请 ${retry}s 后重试` })
  }
  return next()
}

// ============ [L1] 端点白名单 ============

function checkEndpoint(req: Request, res: Response, next: NextFunction) {
  if (!ALLOWED_ENDPOINTS.has(req.path)) {
    return res.status(403).json({ status: -403, message: `不允许代理的端点: ${req.path}` })
  }
  return next()
}

// ============ 转发 ============

async function forward(req: Request, res: Response) {
  const key = process.env.TENCENT_LBS_KEY || ''
  if (!key) {
    return res.status(500).json({ status: -500, message: 'TENCENT_LBS_KEY 未配置（请在后端环境变量中设置）' })
  }

  // 基于固定 host 构造上游 URL，仅透传查询参数（不接受任何 host 输入）
  const upstream = new URL(req.path, TENCENT_LBS_BASE)
  collectQuery(req).forEach(([k, v]) => upstream.searchParams.append(k, v))
  upstream.searchParams.append('key', key)

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    const upstreamRes = await fetch(upstream.toString(), { signal: controller.signal })
    clearTimeout(timer)

    const data = (await upstreamRes.json()) as { status?: number }
    if (data && data.status === 0) {
      const cacheKey = (req as Request & { _lbsCacheKey?: string })._lbsCacheKey
      if (cacheKey) cacheStore(cacheKey, data) // 仅缓存成功响应
    }
    return res.json(data)
  } catch {
    return res.status(502).json({ status: -502, message: '腾讯位置服务上游请求失败' })
  }
}

// ============ 路由 ============

export const lbsProxyRouter = Router()

/**
 * 透传代理：GET /api/lbs/ws/... → https://apis.map.qq.com/ws/...（由服务端注入 key）
 * 中间件顺序：L1 端点 → L2 来源 → L4 缓存命中短路 → L3 限流 → 转发
 * （缓存命中在限流之前短路，故命中请求既不计限流也不打腾讯）
 */
lbsProxyRouter.get('/ws/*', checkEndpoint, checkOrigin, cacheLookup, rateLimit, forward)

export default lbsProxyRouter
