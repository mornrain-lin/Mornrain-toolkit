/**
 * 腾讯位置服务 (LBS) - 跨运行时地图组件（Taro）
 *
 * Genie 小程序有两个运行时：H5 预览 与 weapp 发布。地图渲染按 Taro.getEnv() 分流：
 * - H5（浏览器）：用 JavaScript GL API 渲染交互地图（loadTMapGL + createMap）
 * - weapp：用 Taro 原生 <Map> 组件（GL API 在小程序不可用）
 *
 * 业务方只用 <TencentMap>，无需关心当前运行时。
 *
 * 注意：
 * - 容器需要有明确高度（父容器给高度，或通过 style 传入）
 * - weapp 的信息窗口用 marker 的 callout 结构化字段（不支持 HTML）
 * - H5 使用 GL API 需在 LBS 控制台为预览域名配置域名白名单
 *
 * @example
 * import { TencentMap } from './TencentMap.taro';
 *
 * <TencentMap
 *   center={{ lat: 39.984120, lng: 116.307484 }}
 *   scale={16}
 *   markers={[{ location: { lat: 39.984120, lng: 116.307484 }, title: '会议地点', callout: '中关村大街1号' }]}
 *   style={{ height: '400px' }}
 * />
 */

import React, { useEffect, useMemo } from 'react';
import Taro from '@tarojs/taro';
import { View, Map as TaroMap } from '@tarojs/components';
import type { CSSProperties } from 'react';
import { loadTMapGL, createMap, addMarkerWithInfo } from './tencent-lbs';
import type { Location } from './tencent-lbs';

/**
 * 地图标注点
 */
export interface TencentMapMarker {
  /** 标注坐标 */
  location: Location;
  /** 标注唯一 id（不传则按索引自动生成，仅 weapp 使用） */
  id?: number;
  /** 标注标题 */
  title?: string;
  /** 常驻气泡文案（不传则不显示常驻气泡） */
  callout?: string;
  /** 标注图标 URL（weapp 原生 Map 必填；不传则用内置默认点标记） */
  iconPath?: string;
}

/**
 * weapp 原生 <Map> 的 marker 要求 iconPath: string。
 * 不传自定义图标时用一个内置的红色圆点（data URI），避免类型缺失 & 无图标。
 */
const DEFAULT_MARKER_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
      '<circle cx="12" cy="12" r="8" fill="#e54d42" stroke="white" stroke-width="2"/></svg>'
  );

export interface TencentMapProps {
  /** 地图中心点坐标 */
  center: Location;
  /** 缩放级别，范围 3-20，默认 16 */
  scale?: number;
  /** 标注点列表 */
  markers?: TencentMapMarker[];
  /** 容器样式，默认铺满父容器（父容器需有高度） */
  style?: CSSProperties;
}

/**
 * H5 运行时：JavaScript GL API 交互地图
 */
function TencentMapH5({ center, scale = 16, markers = [], style }: TencentMapProps) {
  // 稳定的容器 id，供 GL API 通过 document.getElementById 定位
  const containerId = useMemo(() => `tmap_${Math.random().toString(36).slice(2)}`, []);

  useEffect(() => {
    let map: ReturnType<typeof createMap> | null = null;
    let cancelled = false;

    (async () => {
      await loadTMapGL();
      if (cancelled) return;
      map = createMap(containerId, { center, zoom: scale });
      markers.forEach((m) => addMarkerWithInfo(map!, m.location, m.title ?? '', m.callout));
    })();

    return () => {
      cancelled = true;
      map?.destroy();
    };
    // 依赖用坐标/缩放的原始值，避免对象引用变化导致的重复初始化
  }, [containerId, center.lat, center.lng, scale, markers]);

  return <View id={containerId} style={{ width: '100%', height: '100%', ...style }} />;
}

/**
 * weapp 运行时：Taro 原生 <Map> 组件
 */
function TencentMapWeapp({ center, scale = 16, markers = [], style }: TencentMapProps) {
  const taroMarkers = markers.map((m, index) => ({
    id: m.id ?? index,
    latitude: m.location.lat,
    longitude: m.location.lng,
    title: m.title,
    iconPath: m.iconPath ?? DEFAULT_MARKER_ICON,
    width: 24,
    height: 24,
    callout: m.callout
      ? {
          content: m.callout,
          display: 'ALWAYS' as const,
          padding: 8,
          borderRadius: 6,
          fontSize: 12,
        }
      : undefined,
  }));

  return (
    <TaroMap
      longitude={center.lng}
      latitude={center.lat}
      scale={scale}
      markers={taroMarkers}
      style={{ width: '100%', height: '100%', ...style }}
    />
  );
}

/**
 * 跨运行时腾讯地图组件（按 Taro.getEnv() 自动分流）
 */
export function TencentMap(props: TencentMapProps) {
  const isH5 = Taro.getEnv() === Taro.ENV_TYPE.WEB;
  return isH5 ? <TencentMapH5 {...props} /> : <TencentMapWeapp {...props} />;
}

export default TencentMap;
