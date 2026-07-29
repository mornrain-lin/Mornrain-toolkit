import Taro from '@tarojs/taro'
import cloudbase from '@cloudbase/js-sdk'
import adapter from '@cloudbase/adapter-taro'

// ============================================================
// 环境变量（通过 Taro config defineConstants 在构建时注入）
// 变量名与 /workspace/.env.tcb 保持一致
// ============================================================
export const ENV_ID = process.env.CLOUDBASE_ENV_ID || ''
export const RESOURCE_APPID = process.env.CLOUDBASE_RESOURCE_APPID || ''

const ACCESS_KEY = process.env.CLOUDBASE_PUBLISH_KEY || ''
const REGION = process.env.CLOUDBASE_REGION || 'ap-shanghai'

export const isH5 = () => Taro.getEnv() === Taro.ENV_TYPE.WEB
export const isWeapp = () => Taro.getEnv() === Taro.ENV_TYPE.WEAPP

// ============================================================
// @cloudbase/js-sdk 初始化（H5 + 小程序通用，用于邮箱/手机号登录等）
// ============================================================
cloudbase.useAdapters(adapter)

const app = cloudbase.init({
  ...(ENV_ID ? { env: ENV_ID } : {}),
  ...(REGION ? { region: REGION } : {}),
  ...(ACCESS_KEY ? { accessKey: ACCESS_KEY } : {}),
})

export const auth = app.auth
export const db = app.database()
export default app

// ============================================================
// wx.cloud 跨账号实例（仅小程序端，用于调云函数获取 openid）
// 方案C：纯云函数，不走 HTTP，不需要域名白名单
// ============================================================
let _wxCloud: any = null
let _wxCloudInitPromise: Promise<any> | null = null

function initWxCloud() {
  if (_wxCloudInitPromise) return _wxCloudInitPromise
  _wxCloudInitPromise = (async () => {
    try {
      const c = new (wx as any).cloud.Cloud({
        resourceAppid: RESOURCE_APPID,
        resourceEnv: ENV_ID,
      })
      await c.init()
      _wxCloud = c
    } catch (e) {
      console.error('[wxCloud] init failed:', e)
      _wxCloudInitPromise = null
    }
    return _wxCloud
  })()
  return _wxCloudInitPromise
}

export async function getWxCloud() {
  if (!isWeapp()) return null
  if (_wxCloud) return _wxCloud
  return initWxCloud()
}
