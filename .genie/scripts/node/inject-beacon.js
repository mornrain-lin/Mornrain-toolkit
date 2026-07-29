#!/usr/bin/env node
/**
 * inject-beacon.js — 在 weapp 构建产物中注入/移除灯塔（Beacon）上报 SDK
 *
 * 用法:
 *   node inject-beacon.js <weapp-dir> [--appkey <key>]    # 注入
 *   node inject-beacon.js <weapp-dir> --remove            # 移除
 *
 * 示例:
 *   node .genie/scripts/node/inject-beacon.js ./weapp --appkey 0AND0VENI0000000
 *   node .genie/scripts/node/inject-beacon.js ./weapp --remove
 *
 * 注意:
 *   - 此脚本不修改用户源码，只操作构建产物
 *   - 重复执行是安全的（幂等）
 *   - beacon_mp.min.js 来源: https://beaconcdn.qq.com/sdk/mp/4.2.6/beacon_mp.min.js
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// 参数解析
// ============================================================================

const args = process.argv.slice(2);

function printUsage() {
  console.error('用法:');
  console.error('  注入: node inject-beacon.js <weapp-dir> [--appkey <key>]');
  console.error('  移除: node inject-beacon.js <weapp-dir> --remove');
  process.exit(1);
}

let weappDir = null;
let appkey = '0AND0VENI0000000';
let removeMode = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--appkey' && args[i + 1]) {
    appkey = args[++i];
  } else if (args[i] === '--remove') {
    removeMode = true;
  } else if (args[i] === '--help' || args[i] === '-h') {
    printUsage();
  } else if (!args[i].startsWith('-')) {
    weappDir = args[i];
  }
}

if (!weappDir) {
  printUsage();
}

weappDir = path.resolve(weappDir);

// ============================================================================
// 路径 & 常量
// ============================================================================

const SCRIPT_DIR = __dirname;
const BEACON_SDK_SRC = path.join(SCRIPT_DIR, 'assets', 'beacon_mp.min.js');
const BEACON_SDK_DEST = path.join(weappDir, 'beacon_mp.min.js');
const APP_JS_PATH = path.join(weappDir, 'app.js');

const INJECT_START = '/* __BEACON_INJECTED_START__ */';
const INJECT_END = '/* __BEACON_INJECTED_END__ */';

// ============================================================================
// 注入片段
// ============================================================================

function buildBeaconSnippet(key) {
  return `${INJECT_START}
;(function(){
  var B = require("./beacon_mp.min.js");
  var b = new B({ appkey: "${key}" });
  try {
    var info = wx.getAccountInfoSync && wx.getAccountInfoSync();
    var appId = (info && info.miniProgram && info.miniProgram.appId) || "";
    b.onDirectUserAction("mp_pv", { appId: appId });
  } catch(e) {}
})();
${INJECT_END}
`;
}

// ============================================================================
// 注入
// ============================================================================

function inject() {
  if (!fs.existsSync(weappDir) || !fs.existsSync(APP_JS_PATH)) {
    console.error(`❌ weapp 产物不存在: ${APP_JS_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(BEACON_SDK_SRC)) {
    console.error(`❌ beacon_mp.min.js 不存在: ${BEACON_SDK_SRC}`);
    process.exit(1);
  }

  fs.copyFileSync(BEACON_SDK_SRC, BEACON_SDK_DEST);

  let appJs = fs.readFileSync(APP_JS_PATH, 'utf8');
  if (appJs.includes(INJECT_START)) {
    return;
  }

  appJs = buildBeaconSnippet(appkey) + appJs;
  fs.writeFileSync(APP_JS_PATH, appJs, 'utf8');
}

// ============================================================================
// 移除
// ============================================================================

function remove() {
  // 删除 SDK 文件
  if (fs.existsSync(BEACON_SDK_DEST)) {
    fs.unlinkSync(BEACON_SDK_DEST);
  }

  // 从 app.js 中移除注入片段
  if (fs.existsSync(APP_JS_PATH)) {
    let appJs = fs.readFileSync(APP_JS_PATH, 'utf8');
    if (appJs.includes(INJECT_START)) {
      const startIdx = appJs.indexOf(INJECT_START);
      const endIdx = appJs.indexOf(INJECT_END);
      if (startIdx !== -1 && endIdx !== -1) {
        appJs = appJs.substring(0, startIdx) + appJs.substring(endIdx + INJECT_END.length);
        // 清理开头可能残留的空行
        appJs = appJs.replace(/^\n+/, '');
        fs.writeFileSync(APP_JS_PATH, appJs, 'utf8');
      }
    }
  }
}

// ============================================================================
// 入口
// ============================================================================

if (removeMode) {
  remove();
} else {
  inject();
}
