// 引擎 UI 文案（中文简体）。剧情数据（对话/选项/道具/结局文案）属创作方内容，不在此翻译。
const zhCN = {
  common: {
    loading: "加载中…",
    loadFailed: "加载失败：{{error}}",
    backToTitle: "返回标题",
    continue: "继续",
  },
  empty: {
    engineTitle: "互动影游引擎",
    noStoryPrefix: "尚未载入剧情。请生成剧情后放入 ",
    noStorySuffix: "。",
    noStoryShort: "尚未载入剧情，请先生成剧情。",
  },
  title: {
    start: "开始游戏",
    continue: "继续游戏",
    gallery: "结局图鉴",
    settings: "设置",
  },
  play: {
    restart: "重新开始",
    gallery: "结局图鉴",
    skip: "跳过 ▸▸",
    autoSave: "自动存档",
    saveName: "存档 {{slot}}",
  },
  gallery: {
    title: "结局图鉴",
  },
  notFound: {
    message: "页面不存在",
    backHome: "返回首页",
  },
  settings: {
    title: "设置",
    textSpeed: "文本速度：{{label}}",
    bgmVolume: "背景音量：{{percent}}%",
    speed: { slow: "慢", normal: "正常", fast: "快", instant: "瞬间" },
  },
  save: {
    title: "存档 / 读档",
    slot: "存档位 {{slot}}",
    empty: "空",
    save: "保存",
    load: "读取",
  },
  backlog: {
    title: "剧情回溯",
    empty: "暂无记录",
  },
  ending: {
    good: "好结局",
    bad: "坏结局",
    hidden: "隐藏结局",
    normal: "结局",
    locked: "？？？（尚未解锁）",
  },
  hud: {
    backlog: "回溯",
    save: "存档",
    settings: "设置",
    title: "标题",
  },
  media: {
    sceneAlt: "场景",
    generating: "素材生成中",
    enableSound: "🔊 开启声音",
  },
  interaction: {
    tap: "点击继续",
    longpress: "长按蓄力",
    holdRelease: "蓄力至满格松手",
    swipe: "滑动",
    drag: "拖到目标",
    rotate: "旋转到位",
    rapidtap: "快速连点",
    rhythm: "跟随节拍点击",
    trace: "按顺序描绘轨迹",
  },
  error: {
    nodeNotFound: "节点不存在: {{nodeId}}",
    httpLoad: "加载失败 {{url}}: HTTP {{status}}",
  },
} as const;

export default zhCN;
