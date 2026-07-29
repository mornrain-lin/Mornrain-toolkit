---
name: tencent-lbs-integrator
description: Integrate Tencent LBS for maps, geocoding, and location services. Use this skill when the application needs interactive maps, address geocoding, location markers, IP geolocation, or place search. Triggers on requests for map display, address lookup, location markers, or geographic services.
_meta_type: sdk
---

# Tencent LBS SDK Integration

## Scenarios

- **Interactive Maps**: Dynamic map display with markers and info windows for meeting/event locations
- **Address Geocoding**: Convert addresses to coordinates for location-based features
- **Reverse Geocoding**: Get address information from coordinates
- **Place Search**: Search for POIs (Points of Interest) by keyword
- **IP Geolocation**: Determine user location from IP address
- **Static Maps**: Generate map images for emails and previews

**Not recommended for:**
- Real-time navigation (requires native SDK)
- Mobile native applications (requires mobile SDK)
- Offline map functionality

## API Key (AI: handle this first)

This skill bundles a shared built-in Key that **works out of the box for prototype/preview** — the user needs to do nothing at this stage.

**Before production / publish, the AI MUST proactively tell the user to apply for their own Key** (the shared key pools quota across apps and may be rate-limited or rotated):

1. Ask the user to create a Key at the [Tencent LBS Console](https://lbs.qq.com/dev/console/application/mine) with **WebService enabled** (required for data calls).
2. The user pastes the Key back; **the AI fills it in** — set `TENCENT_LBS_KEY=<user key>` in the backend `.env`.

**That is the only thing the user must do. Do NOT ask the user for any of the following — they are not needed here:**
- ❌ Domain whitelist — data goes through the backend proxy (server-side call, no browser referer check).
- ❌ "微信小程序 product authorization / AppID" — only needed when calling the SDK directly inside weapp; we use the backend proxy.
- ❌ A Key for weapp map rendering — weapp uses the native `<Map>` (WeChat's built-in map), which consumes no Key.
- The built-in Key constant in `lib/tencent-lbs.ts` usually needs **no replacement** — the weapp product never uses it; only the H5 GL interactive map uses the shared Key.

## Setup

### 1. Install Dependencies

No npm package required for basic usage. The SDK loads the map API dynamically.

### 2. Copy SDK Wrapper

Read `lib/tencent-lbs.ts` from this skill and copy it to the project, then use it directly.

**Platform note (IMPORTANT):** The SDK is split by platform via an injectable transport layer.

| Target | Files to copy | Data requests | Map rendering |
|--------|---------------|---------------|---------------|
| Browser / Web (H5) | `lib/tencent-lbs.ts` | JSONP (auto, default) | JS GL API (`loadTMapGL` + `createMap` ...) |
| Genie MiniProgram (Taro) | `lib/tencent-lbs.ts` + `lib/transport.taro.ts` + `lib/TencentMap.taro.tsx` + `lib/lbs-proxy.express.ts` (backend) | Backend proxy `/api/lbs` (`createTaroLbsClient`) | `TencentMap` (auto: H5→GL, weapp→native `<Map>`) |

`tencent-lbs.ts` itself is framework-agnostic (does NOT import Taro), so it is safe to copy into either kind of project. Genie mini-programs run as **H5 in preview** and **weapp on publish** — see "Taro / MiniProgram Usage (Genie)" for the proxy-based path that works in both.

## Configuration

### Built-in API Key

The SDK ships with a built-in API Key **for quick trial only**:

```typescript
import { createClient, loadTMapGL, createMap } from './lib/tencent-lbs';

const client = createClient();
await loadTMapGL();
```

> The built-in key is **shared** — quota is pooled across apps and it may be rate-limited or rotated. It works out of the box for prototype/preview (including the H5 GL map). For production, switch to your own key (see "API Key" above). A domain whitelist is only relevant if *your own* key restricts referer for the browser-side JS GL map; the backend-proxy data path needs no whitelist.

### Domain Whitelist (optional — security hardening)

Not required to function: an unrestricted key works from any domain, and the backend-proxy path has no browser referer at all. Configure it only to *restrict your own key* to your domains (browser-side JS GL map):

1. Visit [Tencent LBS Console](https://lbs.qq.com/dev/console/application/mine)
2. Go to "Key Management" -> Select Key -> "Settings"
3. Add your website domain to "Domain Whitelist"
4. Subdomains are automatically authorized

## Quick Start

> The `JavaScript GL API` examples below are **browser (H5) only**. For Taro mini-programs, see "Taro / MiniProgram Usage". The `WebService API` and `Static Map URL` examples work on both platforms (mini-program requires injecting `taroTransport`).

### JavaScript GL API (Dynamic Maps — Browser only)

```typescript
import { 
  loadTMapGL, 
  createMap, 
  addMarkerWithInfo,
  createClient 
} from './lib/tencent-lbs';

// 1. Load map API
await loadTMapGL();

// 2. Create map (container element must exist)
const map = createMap('map-container', {
  center: { lat: 39.984120, lng: 116.307484 },
  zoom: 15
});

// 3. Add marker with info window
const { markerLayer, infoWindow } = addMarkerWithInfo(
  map,
  { lat: 39.984120, lng: 116.307484 },
  'Meeting Location',
  '<p>123 Example Street, Beijing</p>'
);
```

### HTML Container

```html
<div id="map-container" style="width: 100%; height: 400px;"></div>
```

### WebService API (Geocoding & Search)

```typescript
import { createClient, LBSError } from './lib/tencent-lbs';

const client = createClient();

// Geocode address
const result = await client.geocode('123 Example Street, Beijing');
console.log(result.result.location); // { lat: 39.984154, lng: 116.307490 }

// Reverse geocode
const address = await client.reverseGeocode(39.984154, 116.307490);
console.log(address.result.address);

// Search places
const places = await client.searchPlace('hotel', {
  boundary: 'region(Beijing,0)'
});

// IP geolocation
const location = await client.ipLocation('111.206.145.41');
```

### Static Map URL

```typescript
const mapUrl = client.getStaticMapUrl({
  center: { lat: 39.908823, lng: 116.397496 },
  zoom: 15,
  size: { width: 600, height: 400 },
  scale: 2,
  markers: [{
    position: { lat: 39.908823, lng: 116.397496 },
    label: 'A',
    color: 'red'
  }]
});

// Use in <img> tag
// <img src={mapUrl} alt="Map" />
```

## React Component Example

```tsx
import { useEffect, useRef, useState } from 'react';
import {
  loadTMapGL,
  createMap,
  addMarkerWithInfo,
  createClient,
  LBSError
} from '@/lib/tencent-lbs';

interface MeetingMapProps {
  address: string;
}

export function MeetingMap({ address }: MeetingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let map: ReturnType<typeof createMap> | null = null;

    async function init() {
      try {
        // Geocode address
        const client = createClient();
        const { result } = await client.geocode(address);
        const location = result.location;

        // Load map API
        await loadTMapGL();

        // Create map
        if (!containerRef.current) return;
        map = createMap(containerRef.current, {
          center: location,
          zoom: 16
        });

        // Add marker and info window
        addMarkerWithInfo(map, location, 'Location', `
          <div style="padding: 10px;">
            <h4>${address}</h4>
          </div>
        `);

        setLoading(false);
      } catch (err) {
        setLoading(false);
        if (err instanceof LBSError) {
          setError(err.getSolution());
        } else {
          setError('Failed to load map');
        }
      }
    }

    init();
    return () => { map?.destroy(); };
  }, [address]);

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="relative">
      {loading && <div className="loading">Loading...</div>}
      <div ref={containerRef} className="w-full h-80" />
    </div>
  );
}
```

## Taro / MiniProgram Usage (Genie)

Genie mini-programs run in **two runtimes**: H5 (dev preview, `pnpm run dev:h5`) and weapp (publish). One codebase must work in both. Key facts:

- **Data requests**: In H5, `Taro.request` → XHR is blocked by CORS on `apis.map.qq.com` (WebService has no CORS headers). In weapp, direct calls need legal-domain config and expose the Key. → **Use the backend proxy** so the frontend only hits same-origin `/api/lbs/*` (no CORS in H5, no legal-domain hassle, Key stays server-side).
- **Map rendering**: The JS GL API works in H5 but not weapp; native `<Map>` works in weapp. → Use `TencentMap` which auto-splits by `Taro.getEnv()`.

### 1. Backend proxy (data layer — recommended)

Copy `lib/lbs-proxy.express.ts` to the backend (e.g. `src/modules/lbs-proxy.ts`), mount it, and set the server-side Key:

```typescript
// backend src/app.ts
import { lbsProxyRouter } from './modules/lbs-proxy';
app.use(`${env.API_PREFIX}/lbs`, lbsProxyRouter); // -> /api/lbs
```

```bash
# backend env
TENCENT_LBS_KEY=<your server-side WebService key>
```

The proxy transparently forwards `/api/lbs/ws/...` → `https://apis.map.qq.com/ws/...`, injecting the Key (endpoint whitelist + fixed host guard against SSRF).

### 2. Frontend data client — `createTaroLbsClient`

`TARO_APP_API_URL` 由 `config/index.ts` 的 `defineConstants` 注入（模板默认已配置）：
- **H5 预览**：值为 `''` → 同源请求 `/api/lbs`，H5 dev server 自动代理到后端
- **weapp 发布**：后端构建时写入 `.env`，注入 sandbox 绝对 HTTPS 域名

> **weapp 必须传绝对后端域名**（`Taro.request` 不接受相对 `/api/lbs`），且该域名须加入小程序后台「request 合法域名」。
>
> `apiBase` 只填**纯源**（如 `https://xxx.example.com`），**不要带 `/api` 或结尾斜杠**——`/api/lbs` 已由 `createTaroLbsClient` 自动拼上，重复带会拼成 `/api/api/lbs`。（与 `api-client.ts` 用同一个 `TARO_APP_API_URL` 值。）

```typescript
import { createTaroLbsClient } from './lib/transport.taro';
import { LBSError } from './lib/tencent-lbs';

// TARO_APP_API_URL 由 defineConstants 注入：
//   H5 预览 → ''  （同源请求 /api/lbs）
//   weapp 发布 → 'https://xxx.sandbox.example.com'（后端动态写入 .env）
declare const TARO_APP_API_URL: string;

const apiBase = typeof TARO_APP_API_URL !== 'undefined' ? TARO_APP_API_URL : '';
const client = createTaroLbsClient(apiBase);

const { result } = await client.geocode('北京市海淀区中关村大街1号');
console.log(result.location); // { lat, lng } — works in both H5 preview and weapp
```

### 3. Map rendering — `TencentMap` (auto runtime split)

Copy `lib/TencentMap.taro.tsx`. It renders the JS GL API interactive map in H5 and native `<Map>` in weapp. Info windows use structured `callout` (HTML not supported).

```tsx
import { View } from '@tarojs/components';
import { useEffect, useState } from 'react';
import { createTaroLbsClient } from '../lib/transport.taro';
import { TencentMap } from '../lib/TencentMap.taro';
import type { Location } from '../lib/tencent-lbs';

declare const TARO_APP_API_URL: string;

export function MeetingMap({ address }: { address: string }) {
  const [center, setCenter] = useState<Location | null>(null);

  useEffect(() => {
    const apiBase = typeof TARO_APP_API_URL !== 'undefined' ? TARO_APP_API_URL : '';
    createTaroLbsClient(apiBase).geocode(address).then(({ result }) => setCenter(result.location));
  }, [address]);

  if (!center) return <View>Loading...</View>;

  return (
    <View style={{ width: '100%', height: '400px' }}>
      <TencentMap center={center} scale={16}
        markers={[{ location: center, title: address, callout: address }]} />
    </View>
  );
}
```

### 4. Configuration checklist

- **`config/index.ts`**: 确保 `defineConstants.TARO_APP_API_URL` 已配置（模板默认已有，详见小程序模板的 `config/index.ts`）。H5 构建时值为空字符串，weapp 发布时后端通过 `.env` 注入沙箱域名。
- **Backend**: `TENCENT_LBS_KEY` env set; `lbsProxyRouter` mounted at `/api/lbs`.
- **weapp publish**: the backend domain (injected as `TARO_APP_API_URL`) must be added to the mini-program "request 合法域名" whitelist. (weapp map is native and needs no LBS key/whitelist.)
- **No client-side Key** in proxy mode — the frontend never holds the WebService Key.

### 5. Proxy security (built-in, defense-in-depth)

`lbs-proxy.express.ts` is a **public GET endpoint**, so it ships with layered abuse controls (all in-process, zero extra deps):

| Layer | What it does |
|-------|--------------|
| L1 Endpoint whitelist | Only the 3 `/ws/*` endpoints are proxied (blocks traversal / other APIs) |
| L2 Origin/Referer allowlist | Only requests from allowed hosts pass (unset ⇒ allow, for dev/sandbox; weapp has no Origin ⇒ passes, relies on L3) |
| L3 Per-IP rate limit | Caps single-source flooding. **Skipped when `NODE_ENV=development`** so debugging is never throttled |
| L4 Same-param cache | Repeated queries return cached data — not forwarded to Tencent, not counted by L3 (protects quota + debugging) |

Tunable env (all optional, sane defaults):

| Env | Default | Purpose |
|-----|---------|---------|
| `LBS_ALLOWED_ORIGINS` | (empty ⇒ allow all) | Comma-separated allowed hosts for L2 |
| `LBS_RATE_LIMIT_WINDOW_MS` | `60000` | L3 window |
| `LBS_RATE_LIMIT_MAX` | `60` | L3 max requests per IP per window |
| `LBS_CACHE_TTL_MS` | `300000` | L4 cache TTL |
| `LBS_CACHE_MAX_ENTRIES` | `500` | L4 cache size cap (bounds memory) |

**Important limits — read before relying on this:**
- L2 headers are spoofable and L3 IPs are rotatable; these only *reduce* abuse scale, they do not stop a determined attacker.
- **The real cost ceiling must be set in the Tencent LBS console**: use a **dedicated Key per app** + a **daily quota cap** + monitoring/alerts. The proxy cannot enforce this — it lives outside the code.
- Rate limiting is per-process (in-memory). For multi-instance deployments, back it with Redis instead.
- If the proxy sits behind a reverse proxy, enable Express `trust proxy` so `req.ip` reflects the real client.

## Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| 110 | Unauthorized referer | Add domain to whitelist in console |
| 112 | Unauthorized IP | Configure authorized IP or use domain whitelist |
| 120 | WebService not enabled | Enable WebService in Key settings |
| 121 | Feature not authorized | Apply for permission in console |
| 122 | Quota exceeded | Request higher quota or retry later |
| 311 | Key disabled | Restore Key in console |
| -403 | Proxy: endpoint/origin not allowed | Check `/ws/*` path and `LBS_ALLOWED_ORIGINS` |
| -429 | Proxy: rate limited | Retry after `Retry-After` seconds; tune `LBS_RATE_LIMIT_*` |

## Architecture Integration

### Service Layer Pattern (Recommended)

```typescript
// src/services/location.service.ts
import { createClient, loadTMapGL, createMap } from '../lib/tencent-lbs';

export class LocationService {
  private client = createClient();

  async geocodeAddress(address: string) {
    const result = await this.client.geocode(address);
    return result.result.location;
  }

  async searchNearbyPlaces(lat: number, lng: number, keyword: string) {
    return this.client.searchPlace(keyword, {
      boundary: `nearby(${lat},${lng},1000)`
    });
  }

  getStaticMapForAddress(address: string) {
    return this.client.getMapByAddress(address, {
      zoom: 16,
      size: { width: 600, height: 400 }
    });
  }
}
```

## Security Best Practices

1. **Configure domain whitelist**: Restrict API access to your domains
2. **Use backend proxy for sensitive operations**: Don't expose API key in client code for sensitive queries
3. **Implement rate limiting**: Prevent excessive API calls
4. **Cache geocoding results**: Reduce API usage for frequently queried addresses

## Troubleshooting

**Map Not Loading**
- Verify API Key is correct
- Check domain is in whitelist
- Ensure network connectivity

**Error 110: Unauthorized Referer**
- Add your domain to whitelist in LBS console
- Wait 1-2 minutes for changes to take effect

**Map Container Not Displaying**
- Container element must exist before creating map
- Container must have explicit width and height set

**Markers Not Showing**
- Verify coordinates format (latitude first, then longitude)
- Ensure coordinates are within valid range

## Resources

- **SDK Wrapper Source**: `lib/tencent-lbs.ts` (framework-agnostic core + browser JSONP + JS GL API)
- **MiniProgram Transport / Client**: `lib/transport.taro.ts` (`taroTransport` + `createTaroLbsClient`)
- **MiniProgram Map Component**: `lib/TencentMap.taro.tsx` (`TencentMap`, auto H5/weapp split)
- **Backend Proxy Route**: `lib/lbs-proxy.express.ts` (Express router, injects server-side Key)
- **JavaScript GL API**: https://lbs.qq.com/webApi/javascriptGL/glGuide/glBasic
- **WebService API**: https://lbs.qq.com/service/webService/webServiceGuide/webServiceOverview
- **Console**: https://lbs.qq.com/dev/console/application/mine
- **Key Configuration Guide**: https://lbs.qq.com/faq/serverFaq/webServiceKey
