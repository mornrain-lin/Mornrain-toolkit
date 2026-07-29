/**
 * 腾讯位置服务 (LBS) - 小程序（Taro）传输层实现
 *
 * 面向 Genie 小程序（H5 预览 + weapp 发布）的推荐用法是「后端代理模式」：
 * 前端只请求同源 /api/lbs/*，由后端透传到腾讯并注入服务端 Key。
 * 此时用 Taro.request 即可，在 H5（同源，无 CORS）与 weapp（后端为合法域名）两个运行时都通用。
 *
 * @example
 * import { createTaroLbsClient } from './transport.taro';
 *
 * // TARO_APP_API_URL 由 config/index.ts 的 defineConstants 注入：
 * //   H5 预览 → ''  （同源请求 /api/lbs）
 * //   weapp 发布 → 'https://xxx.sandbox.example.com'（后端写入 .env）
 * declare const TARO_APP_API_URL: string;
 * const apiBase = typeof TARO_APP_API_URL !== 'undefined' ? TARO_APP_API_URL : '';
 * const client = createTaroLbsClient(apiBase);
 * const { result } = await client.geocode('北京市海淀区中关村大街1号');
 */

import Taro from '@tarojs/taro';
import { createClient, LBSError } from './tencent-lbs';
import type { LBSTransport, LBSRawResponse, TencentLBSClient } from './tencent-lbs';

/**
 * 小程序端传输实现：基于 Taro.request 发起 GET 并拿回 JSON。
 * 既用于「后端代理模式」（同源 /api/lbs/*，推荐），也可用于 weapp 直连腾讯。
 */
export const taroTransport: LBSTransport = async (url, timeout = 10000) => {
  try {
    const res = await Taro.request({
      url,
      method: 'GET',
      timeout,
      header: { 'Content-Type': 'application/json' },
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new LBSError(-2, `腾讯位置服务请求失败：HTTP ${res.statusCode}。请检查后端代理或网络配置。`);
    }

    return res.data as LBSRawResponse;
  } catch (err) {
    if (err instanceof LBSError) {
      throw err;
    }
    throw new LBSError(-2, '腾讯位置服务网络请求失败。请检查网络连接及后端 /api/lbs 代理是否可用。');
  }
};

/**
 * 便捷工厂：创建「后端代理模式」的 LBS 客户端（推荐用于 Genie 小程序）。
 *
 * - baseUrl 指向后端代理 `${apiBase}/api/lbs`
 * - appendKey=false：Key 由后端注入，前端不持有
 * - transport=taroTransport：H5 + weapp 两端通用
 *
 * @param apiBase 后端基地址。H5 传 ''（同源）；weapp 传后端域名（须在小程序 request 合法域名内）
 */
export function createTaroLbsClient(apiBase = ''): TencentLBSClient {
  return createClient({
    baseUrl: `${apiBase}/api/lbs`,
    appendKey: false,
    transport: taroTransport,
  });
}

export default taroTransport;
