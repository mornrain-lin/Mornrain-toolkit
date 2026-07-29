#!/usr/bin/env python3
"""
从监控API获取错误数据并直接返回原始JSON

用法：
    python3 fetch_monitor_errors.py              # 获取并消费错误（消费后错误会被清空）
    python3 fetch_monitor_errors.py --no-consume  # 仅获取错误，不消费

输出：
    API返回的原始JSON数据
"""

import os
import sys
import json
import urllib.request
import urllib.error
import time
import argparse


def fetch_monitor_errors(space_key: str, space_host: str, space_region: str, consume: bool = True) -> dict:
    """从API获取错误监控数据"""
    # 添加时间戳参数避免缓存
    cache_buster = int(time.time() * 1000)
    
    # 构建API URL
    if space_key:
        # CloudStudio环境
        base_url = f"https://{space_key}--55220.{space_region}.{space_host}/api/monitor/errors/genie-session-{space_key}"
        # print(f"🌐 环境: CloudStudio", file=sys.stderr)
    else:
        # 本地环境
        base_url = "http://localhost:55220/api/monitor/errors/genie-session-local"
        # print(f"🌐 环境: 本地开发", file=sys.stderr)
    
    api_url = f"{base_url}?consume={'true' if consume else 'false'}&_t={cache_buster}"
    
    # print(f"🔍 正在从API获取数据...", file=sys.stderr)
    # print(f"📡 API地址: {api_url}", file=sys.stderr)
    
    try:
        # 发送HTTP请求
        req = urllib.request.Request(api_url)
        req.add_header('User-Agent', 'Mozilla/5.0 (Python Monitor Error Fetcher)')
        
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode('utf-8'))
            
            if data.get('code') != 0:
                raise ValueError(f"API返回失败: {data}")
            
            # print(f"✅ 数据获取成功", file=sys.stderr)
            return data
            
    except urllib.error.HTTPError as e:
        raise Exception(f"HTTP错误 {e.code}: {e.reason}")
    except urllib.error.URLError as e:
        raise Exception(f"网络错误: {e.reason}")
    except json.JSONDecodeError as e:
        raise Exception(f"JSON解析错误: {e}")


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='从监控API获取前端运行时错误数据')
    parser.add_argument('--no-consume', action='store_true', help='仅获取错误，不消费（错误数据不会被清空）')
    args = parser.parse_args()

    consume = not args.no_consume

    # 从环境变量获取space_key（本地环境可能为空）
    space_key = os.environ.get('X_IDE_SPACE_KEY', '')
    space_host = os.environ.get('X_IDE_SPACE_HOST', '')
    space_region = os.environ.get('X_IDE_SPACE_REGION', '')
    
    try:
        # 获取错误数据
        data = fetch_monitor_errors(space_key, space_host, space_region, consume=consume)
        
        # 直接输出原始JSON到stdout
        print(json.dumps(data, ensure_ascii=False, indent=2))
        
    except Exception as e:
        print(f"❌ 错误: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
