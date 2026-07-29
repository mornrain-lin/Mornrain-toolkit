import type zhCN from "./zh-CN";

// 与 zh-CN 结构一致（键完整、层级相同），叶子放宽为任意 string
type DeepString<T> = { [K in keyof T]: T[K] extends object ? DeepString<T[K]> : string };

// 引擎 UI 文案（English）。结构受 zhCN 约束，保证与中文字典键一一对应。
const en: DeepString<typeof zhCN> = {
  common: {
    loading: "Loading…",
    loadFailed: "Failed to load: {{error}}",
    backToTitle: "Back to Title",
    continue: "Continue",
  },
  empty: {
    engineTitle: "Interactive Film Game Engine",
    noStoryPrefix: "No story loaded yet. Generate a story and place it at ",
    noStorySuffix: ".",
    noStoryShort: "No story loaded yet. Please generate a story first.",
  },
  title: {
    start: "Start",
    continue: "Continue",
    gallery: "Ending Gallery",
    settings: "Settings",
  },
  play: {
    restart: "Restart",
    gallery: "Ending Gallery",
    skip: "Skip ▸▸",
    autoSave: "Auto Save",
    saveName: "Save {{slot}}",
  },
  gallery: {
    title: "Ending Gallery",
  },
  notFound: {
    message: "Oops! Page not found",
    backHome: "Return to Home",
  },
  settings: {
    title: "Settings",
    textSpeed: "Text Speed: {{label}}",
    bgmVolume: "BGM Volume: {{percent}}%",
    speed: { slow: "Slow", normal: "Normal", fast: "Fast", instant: "Instant" },
  },
  save: {
    title: "Save / Load",
    slot: "Slot {{slot}}",
    empty: "Empty",
    save: "Save",
    load: "Load",
  },
  backlog: {
    title: "Story Log",
    empty: "No records yet",
  },
  ending: {
    good: "Good Ending",
    bad: "Bad Ending",
    hidden: "Hidden Ending",
    normal: "Ending",
    locked: "??? (Locked)",
  },
  hud: {
    backlog: "Log",
    save: "Save",
    settings: "Settings",
    title: "Title",
  },
  media: {
    sceneAlt: "Scene",
    generating: "Generating media…",
    enableSound: "🔊 Enable sound",
  },
  interaction: {
    tap: "Tap to continue",
    longpress: "Press and hold",
    holdRelease: "Hold to full, then release",
    swipe: "Swipe",
    drag: "Drag to target",
    rotate: "Rotate into place",
    rapidtap: "Tap rapidly",
    rhythm: "Tap to the beat",
    trace: "Trace the path in order",
  },
  error: {
    nodeNotFound: "Node not found: {{nodeId}}",
    httpLoad: "Failed to load {{url}}: HTTP {{status}}",
  },
};

export default en;
