# story.json 逐字段 API 参考

本文档是 `story.json` 的**唯一字段权威**。数据生产方按此契约产出数据。

`story.schema.json` 负责字段、类型、枚举和节点内约束；`scripts/validate.py` 直接执行该 Schema，并补充节点引用、唯一入口、可达性等 JSON Schema 无法表达的图语义校验。数据必须同时满足两类约束。

## 顶层结构

```jsonc
{
  "meta":       { ... },   // 必填：作品元信息
  "config":     { ... },   // 可选：全局外观/功能配置
  "variables":  { ... },   // 可选：状态变量初值
  "items":      [ ... ],   // 可选：道具库
  "characters": [ ... ],   // 可选：角色库
  "nodes":      { ... }    // 必填：剧情节点字典
}
```

---

## 1. meta（必填）

作品元信息。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | 是 | 作品标题，兼作存档命名空间 key |
| `version` | string | 是 | 数据版本号，建议语义化版本（如 `"1.0.0"`） |
| `start` | string | 是 | 入口节点 id，必须存在于 `nodes` 中 |

```jsonc
{
  "meta": {
    "title": "阴门关",
    "version": "1.0.0",
    "start": "start_01"
  }
}
```

---

## 2. config（可选）

故事级全局配置。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | 否 | 标题页主标题 |
| `subtitle` | string | 否 | 标题页副标题 |
| `locale` | enum | 否 | 引擎 UI 语言：`zh-CN`/`en`，不填落 `zh-CN`。仅影响引擎界面文案，不改剧情内容 |
| `poster` | string(URL) | 否 | 标题页封面图 URL |
| `theme` | object | 否 | 主题色/风格配置 |
| `typography` | object | 否 | 排版配置（`textSpeed`：`slow`/`normal`/`fast`/`instant`） |
| `audio` | object | 否 | 全局音频配置 |
| `features` | object | 否 | 功能开关 |
| `skin` | object | 否 | UI 皮肤配置 |
| `motion` | object | 否 | 动效配置 |

### theme

```jsonc
{
  "theme": {
    "mode": "dark",           // "light" | "dark"
    "accent": "#8b1a1a",      // 强调色 hex
    "preset": "horror"        // 成套游戏风格主题，见下表；不填落 minimal 兜底
  }
}
```

`preset` 一行整体换皮：选项按钮 / 道具栏 / 字幕 / HUD / 结局卡的配色与字体默认一起切换。单点覆盖（`skin.choiceStyle` / `skin.accent` / `skin.font` / `choice.skin`）优先级仍高于主题默认。

#### 主题选择指引

| preset | 调性 | 适用题材 |
|--------|------|---------|
| `minimal` | 中性玻璃拟态，无强色（默认兜底） | 现实/生活/通用，或拿不准时 |
| `horror` | 暗金绶带 + 血红点缀，衬线字 | 恐怖、悬疑、灵异、克苏鲁 |
| `scifi` | 霓虹青描边，冷色发光，直角 | 科幻、赛博朋克、末世、太空 |
| `fantasy` | 描金卷轴框，暖色，宝石感道具，衬线字 | 奇幻、RPG、武侠、修仙 |
| `romance` | 干净留白，粉柔色，圆润气泡 | 都市言情、校园、乙女、恋爱 |

### audio

```jsonc
{
  "audio": {
    "bgm": "https://cos.example.com/bgm/main.mp3",  // 全局 BGM URL
    "bgmVolume": 0.7,           // BGM 音量 0~1，默认 0.7
    "sfxVolume": 1.0            // 音效音量 0~1，默认 1.0
  }
}
```

### features

```jsonc
{
  "features": {
    "backlog": true,      // 是否启用历史记录，默认 true
    "gallery": false,     // 是否启用画廊，默认 false
    "inventory": false,   // 是否启用道具背包，默认 false
    "autosave": true,     // 是否启用自动存档，默认 true
    "saveSlots": 10       // 存档栏位数，默认 10
  }
}
```

### skin

```jsonc
{
  "skin": {
    "choiceStyle": "ribbon",  // "plain" | "ribbon" | "plaque"
    "frame": "https://cos.example.com/frame/deco.png", // 全局共享装饰底图 URL（可选）
    "font": "sans",           // "sans" | "serif"
    "accent": "#8b1a1a"       // 强调色，覆盖 theme.accent
  }
}
```

### motion

```jsonc
{
  "motion": {
    "transition": "fade",           // 节点转场，见节点 transition 枚举
    "choiceReveal": "stagger-fade", // 选项入场，"stagger-fade"|"slide-up"|"scale-in"|"typewriter"|"glow-pulse"
    "textStyle": "banner",          // 文本呈现，"banner"|"bubble"|"centered"
    "intensity": "normal",          // 动效强度，"subtle"|"normal"|"cinematic"
    "reducedMotion": "auto"         // 无障碍减弱动效，"auto"|"on"|"off"
  }
}
```

---

## 3. variables（可选）

状态变量初值。key 为变量名，value 为初值（仅支持 `boolean` / `number` / `string`）。

```jsonc
{
  "variables": {
    "has_key": false,
    "trust_level": 0,
    "chosen_path": ""
  }
}
```

---

## 4. items（可选）

道具库。每个道具一个对象。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 道具唯一标识 |
| `name` | string | 是 | 道具显示名称 |
| `image` | string(URL) | 否 | 道具图 URL（道具栏展示用） |

```jsonc
{
  "items": [
    { "id": "old_key", "name": "生锈的钥匙", "image": "https://cos.example.com/items/key.png" }
  ]
}
```

---

## 5. characters（可选）

角色库。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 角色唯一标识 |
| `name` | string | 是 | 角色显示名称 |
| `image` | string(URL) | 否 | 角色参考图 URL |

```jsonc
{
  "characters": [
    { "id": "hero", "name": "小明", "image": "https://cos.example.com/avatars/hero.png" }
  ]
}
```

---

## 6. nodes（必填）

剧情节点字典。key 为节点 id，value 为节点对象。

### 节点通用字段

| 字段 | 类型 | 必填 | 适用节点 | 说明 |
|------|------|------|----------|------|
| `type` | enum | 是 | 全部 | 节点类型：`start` / `scene` / `choice` / `ending` / `interaction` |
| `text` | string | 是 | 全部 | 本幕文案（剧本真源），多段用 `\n` 分隔 |
| `media` | object | 否 | 全部 | 多媒体配置 |
| `bgm` | string(URL) | 否 | 全部 | 节点级背景音 URL（覆盖全局 BGM） |
| `effects` | object[] | 否 | 全部 | 进入节点时应用的状态变更（见 effects 对象） |
| `next` | string | 条件 | start/scene/interaction | 线性后继节点 id |
| `choices` | object[] | 条件 | scene/choice | 分支选项（>=2） |
| `clipDuration` | number | 否 | scene/choice/interaction | 片段时长（秒） |
| `choiceAt` | number | 否 | scene/choice | 选项浮现时机（秒） |
| `transition` | enum | 否 | 全部 | 进入转场：`fade`/`fade-black`/`fade-white`/`slide-up`/`slide-down`/`slide-left`/`slide-right`/`zoom`/`blur`/`dissolve`/`glitch`/`ripple`/`none` |
| `textStyle` | enum | 否 | 全部 | 文本呈现：`banner`/`bubble`/`centered` |
| `typewriter` | boolean | 否 | 全部 | 是否逐字打字机（默认 false，字幕整句直显） |
| `speaker` | string | 否 | 全部 | 当前说话人（引用 `characters[].id`） |
| `fx` | string[] | 否 | 全部 | 节点触发的瞬时视听/振动反馈列表；仅影响表现，不修改剧情状态。详见下文 |
| `ending_type` | enum | 条件 | ending | 结局类型：`good`/`bad`/`hidden`/`normal` |
| `interaction` | enum | 条件 | interaction | 交互类型：见下文 |

### fx（节点瞬时反馈）

`fx` 用于加强当前剧情节点的表现力，不参与变量、道具或分支计算。普通节点在进入时触发；`interaction` 节点在用户完成交互时触发。多个反馈可组合，视觉反馈约 700ms 后自动结束。

| 值 | 实际效果 |
|------|------|
| `shake-light` | 画面轻微横向震动 |
| `shake-heavy` | 画面较强的横纵震动 |
| `flash` | 屏幕快速白闪 |
| `vignette` | 屏幕边缘短暂变暗 |
| `zoom-punch` | 画面快速放大后恢复 |
| `slowmo` | 画面短暂增强饱和度；当前不会改变视频播放速度 |
| `sparkle` | 屏幕出现短暂金色闪光粒子 |
| `haptic-light` | 设备轻振约 20ms；浏览器不支持振动时忽略 |
| `haptic-medium` | 设备中等振动约 60ms；浏览器不支持振动时忽略 |
| `sfx:<音频URL>` | 立即播放一次 HTTP(S) 音频，例如 `sfx:https://cdn.example.com/hit.mp3` |

```jsonc
{
  "fx": ["shake-heavy", "flash", "sfx:https://cdn.example.com/hit.mp3"]
}
```

`fx` 与 `effects` 不同：`fx` 只产生瞬时表现反馈；`effects` 会修改变量或道具等剧情状态。

### media 对象

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | enum | 是 | 媒体类型，当前仅支持 `"video"` |
| `src` | string(URL) | 是 | 视频 URL |
| `subtitle` | string(URL) | 否 | 字幕文件 URL（`.vtt`/`.srt`/`.ass`） |

### choices 对象

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `label` | string | 是 | 选项显示文字 |
| `next` | string | 是 | 选中后跳转的节点 id |
| `condition` | object | 否 | 选项可见条件（结构化对象，见 condition 对象） |
| `effects` | object[] | 否 | 选择后立即应用的状态变更（见 effects 对象） |
| `skin` | enum | 否 | overlay 选项皮肤：`plain`/`ribbon`/`plaque` |
| `art` | string(URL) | 否 | overlay 选项专属装饰底图 URL |
| `hint` | boolean | 否 | hotspots 布局是否显示可见提示 |
| `anchor` | object | 否 | overlay 布局锚点 `{x,y}`（相对媒体框 0~1） |
| `region` | object | 否 | hotspots 布局热区 `{x,y,w,h}`（相对媒体框 0~1） |

### effects 对象

状态变更采用 **`op` 结构**：`set`/`inc`/`dec` 作用于变量，`add`/`remove` 作用于道具。

| op | 附带字段 | 说明 |
|------|------|------|
| `set` | `var`, `value` | 将变量设为指定值 |
| `inc` | `var`, `value?` | 变量自增（`value` 缺省为 1） |
| `dec` | `var`, `value?` | 变量自减（`value` 缺省为 1） |
| `add` | `item` | 添加道具到背包 |
| `remove` | `item` | 从背包移除道具 |

```jsonc
{
  "effects": [
    { "op": "set", "var": "has_key", "value": true },
    { "op": "inc", "var": "trust", "value": 1 },
    { "op": "add", "item": "old_key" }
  ]
}
```

### condition 对象

选项可见条件为**结构化对象**（引擎安全求值，不接受字符串表达式）。叶子为比较 / 拥有道具 / 到访节点，可用 `and`/`or`/`not` 递归组合。

| 形态 | 结构 | 说明 |
|------|------|------|
| 比较 | `{ "op": ">=", "var": "trust", "value": 1 }` | `op` ∈ `>=` `>` `<=` `<` `==` `!=` |
| 拥有道具 | `{ "op": "has", "item": "old_key" }` | 背包含指定道具 |
| 到访节点 | `{ "op": "visited", "node": "scene_03" }` | 曾进入指定节点 |
| 与 | `{ "and": [ <cond>, <cond> ] }` | 全部成立 |
| 或 | `{ "or": [ <cond>, <cond> ] }` | 任一成立 |
| 非 | `{ "not": <cond> }` | 取反 |

```jsonc
{
  "condition": {
    "and": [
      { "op": "has", "item": "old_key" },
      { "op": ">=", "var": "trust", "value": 1 }
    ]
  }
}
```

### interaction 枚举值

| 值 | 说明 |
|------|------|
| `tap` | 点击/轻触 |
| `longpress` | 长按 |
| `hold-release` | 蓄力后释放 |
| `swipe` | 滑动 |
| `drag` | 拖拽 |
| `rotate` | 旋转 |
| `rapidtap` | 快速连点 |
| `rhythm` | 节奏点击 |
| `trace` | 描线 |
| `hotspots` | 多点热区 |

---

## 节点类型约束

### start（入口节点）
- 全剧有且仅有一个
- 必须包含 `next`（线性后继）
- 不得包含 `choices`

### scene（叙事场景）
- 可包含 `choices`（>=2，有 choices 时用户选择分支）
- 可包含 `next`（无 choices 时线性推进）
- `choices` 和 `next` 互斥：有 choices 则无 next，有 next 则无 choices

### choice（分支选择）
- 必须包含 `choices`（>=2）
- 不得包含 `next`

### ending（结局节点）
- 必须包含 `ending_type`
- 不得包含 `next` 或 `choices`
- 图结构中所有 ending 必须可达

### interaction（交互节点）
- 必须包含 `interaction` 字段指定交互类型
- 必须包含 `next`（线性后继）

---

## 完整示例

```jsonc
{
  "meta": {
    "title": "阴门关",
    "version": "1.0.0",
    "start": "start_01"
  },
  "config": {
    "theme": { "mode": "dark", "accent": "#8b1a1a", "preset": "horror" },
    "audio": { "bgm": "https://cos.example.com/bgm/main.mp3", "bgmVolume": 0.7 }
  },
  "variables": {
    "has_key": false,
    "trust": 0
  },
  "items": [
    { "id": "old_key", "name": "生锈的钥匙", "image": "https://cos.example.com/items/key.png" }
  ],
  "characters": [
    { "id": "hero", "name": "小明", "image": "https://cos.example.com/avatars/hero.png" }
  ],
  "nodes": {
    "start_01": {
      "type": "start",
      "text": "夜色如墨，你站在一座古老的城门前。",
      "media": {
        "type": "video",
        "src": "https://cos.example.com/video/opening.mp4",
        "subtitle": "https://cos.example.com/subtitles/opening.vtt"
      },
      "speaker": "hero",
      "next": "scene_01"
    },
    "scene_01": {
      "type": "scene",
      "text": "城门缓缓打开，你看到一条幽深的小径。",
      "media": { "type": "video", "src": "https://cos.example.com/video/path.mp4" },
      "clipDuration": 30,
      "choices": [
        {
          "label": "走进城门",
          "next": "ending_01",
          "effects": [{ "op": "set", "var": "has_key", "value": true }]
        },
        {
          "label": "转身离开",
          "next": "ending_01"
        }
      ]
    },
    "ending_01": {
      "type": "ending",
      "ending_type": "bad",
      "text": "你选择了离开，故事就此结束。"
    }
  }
}
```

---

## 播放模型

```
start → scene → scene(含choice) → interaction → scene(含choice) → ending
```

- 引擎从 `meta.start` 指定的入口节点开始播放
- `scene`/`interaction` 节点播完后，有 `next` 则自动前进，有 `choices` 则等待用户选择
- `choice` 节点显示选项列表，用户选择后跳转
- `ending` 节点播放后显示结局画面

---

## 字幕规范

- 字幕文件上传 COS，URL 写进 `media.subtitle`
- 支持格式：`.vtt` / `.srt` / `.ass`（按扩展名推断）
- 说话人标识：WebVTT 使用 `<v 角色名>` voice tag
- 无 `subtitle` 字段则该段无字幕（安全兜底，不报错）

---

## 素材托管规范

- 所有素材（视频/图片/音频/字幕/封面/按钮底图）上传到 COS
- 使用 http(s) URL 直接引用，无占位符 ID、无本地落盘、无 id→url 映射
- 引擎运行时直接按 URL 加载；URL 未就绪/失败时占位兜底
- 需保证 COS 允许引擎域名跨域（CORS）
