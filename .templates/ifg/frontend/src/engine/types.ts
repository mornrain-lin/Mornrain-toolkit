export type Kind = "video" | "image" | "audio";

export interface StoryMeta {
  title: string;
  version: string;
  start: string;
}

export interface CharacterDef { id: string; name: string; image?: string; } // image=角色参考图 URL（可选，描述用）
export interface ItemDef { id: string; name: string; image?: string; }       // image=道具图 URL（可选，描述用）

export type VarValue = number | boolean | string;
export type Variables = Record<string, VarValue>;

// ---- Conditions（结构化、可安全求值）----
export interface CompareCond { op: ">=" | ">" | "<=" | "<" | "==" | "!="; var: string; value: VarValue; }
export interface HasCond { op: "has"; item: string; }
export interface VisitedCond { op: "visited"; node: string; }
export interface AndCond { and: Condition[]; }
export interface OrCond { or: Condition[]; }
export interface NotCond { not: Condition; }
export type Condition = CompareCond | HasCond | VisitedCond | AndCond | OrCond | NotCond;

// ---- Effects ----
export interface SetEffect { op: "set"; var: string; value: VarValue; }
export interface DeltaEffect { op: "inc" | "dec"; var: string; value?: number; }
export interface ItemEffect { op: "add" | "remove"; item: string; }
export type Effect = SetEffect | DeltaEffect | ItemEffect;

export interface Point { x: number; y: number; }
export interface Region { x: number; y: number; w: number; h: number; }

/** 选项/交互皮肤（跨主题通用的选项形态，配色由主题 token 决定） */
export type Skin = "plain" | "ribbon" | "plaque";
/** 成套游戏风格主题：整体换皮（选项/道具/文字/HUD/结局卡一起变） */
export type ThemePreset = "minimal" | "horror" | "scifi" | "fantasy" | "romance";
/** 手势输入控件 */
export type Interaction =
  | "tap" | "longpress" | "hold-release" | "swipe" | "drag"
  | "rotate" | "rapidtap" | "rhythm" | "trace" | "hotspots";
/** 方向（swipe/drag） */
export type Direction = "up" | "down" | "left" | "right" | "any";
/** 节点转场 */
export type Transition =
  | "fade" | "fade-black" | "fade-white" | "slide-up" | "slide-down"
  | "slide-left" | "slide-right" | "zoom" | "blur" | "dissolve"
  | "glitch" | "ripple" | "none";
/** 选项入场动画 */
export type ChoiceReveal = "stagger-fade" | "slide-up" | "scale-in" | "typewriter" | "glow-pulse";
/** 节点瞬时表现反馈（sfx:<http(s)音频URL> 由运行时直接播放） */
export type Fx =
  | "shake-light" | "shake-heavy" | "flash" | "vignette"
  | "zoom-punch" | "slowmo" | "sparkle" | "haptic-light" | "haptic-medium";
/** 文本呈现样式 */
export type TextStyle = "banner" | "bubble" | "centered";
/** choice 布局 */
export type ChoiceLayout = "bar" | "overlay" | "hotspots";

export interface Choice {
  label: string;
  next: string;
  condition?: Condition;
  effects?: Effect[];
  anchor?: Point;   // overlay 布局：相对媒体框 0~1
  region?: Region;  // hotspots 布局：相对媒体框 0~1
  skin?: Skin;      // overlay 选项皮肤（覆盖 config.skin.choiceStyle）
  art?: string;     // overlay 选项专属装饰底图 URL（无字，文字前端叠加）
  hint?: boolean;   // hotspots 是否显示可见提示
}

export type NodeType = "start" | "scene" | "choice" | "ending" | "interaction";
export type EndingType = "good" | "bad" | "hidden" | "normal";

/** 节点媒体引用：直接给可访问 URL（如 COS 上传后的 http(s) 链接），不再用占位符 ID。
 *  媒体只支持 video —— 互动影游以带声视频为叙事骨架，图片类静态素材不作为节点主媒体。 */
export interface MediaRef {
  type: "video";
  src: string;        // 完整可访问 URL（http/https，通常 COS）
  subtitle?: string;  // 视频字幕文件 URL（.vtt/.srt/.ass，可选）
}

export interface StoryNode {
  type: NodeType;
  text?: string;
  media?: MediaRef;     // 本幕媒体：{ type, src(URL), subtitle?(URL) }，直接用 COS 等可访问 URL
  bgm?: string;         // 背景音 URL（可选，节点级覆盖全局 config.audio.bgm）
  effects?: Effect[];   // 进入节点时应用
  next?: string;        // start / scene / interaction
  choices?: Choice[];   // choice
  ending_type?: EndingType; // ending

  // ---- 表现层 ----
  layout?: ChoiceLayout;      // choice 布局，缺省 bar
  transition?: Transition;    // 本节点进入转场（覆盖 config.motion.transition）
  choiceReveal?: ChoiceReveal; // choice 选项入场（覆盖 config.motion.choiceReveal）
  fx?: Fx[] | string[];       // 节点瞬时表现反馈（含 "sfx:<http(s)音频URL>"）
  speaker?: string;           // 说话人（对应 characters.id）
  textStyle?: TextStyle;      // 文本呈现（覆盖 config.motion.textStyle）
  typewriter?: boolean;       // 是否逐字打字机（默认 false，字幕整句直显；多用于纯旁白/图片节点）
  // 注：视频节点字幕不再内嵌，改由同 ID 的独立字幕文件（.vtt/.srt/.ass）承载，引擎交 ArtPlayer 渲染
  clipDuration?: number;      // 片段时长(秒)：无真实视频/图片时按此自动推进；有视频则以视频时长为准
  choiceAt?: number;          // choice/interaction 浮现时机(秒，相对片段起点)，缺省=片段末尾

  // ---- 交互层（type==="interaction"）----
  interaction?: Interaction;
  prompt?: string;            // 交互操作提示
  duration?: number;          // longpress/hold-release 蓄力时长(ms)
  window?: number;            // hold-release/rhythm 命中窗口(ms)
  direction?: Direction;      // swipe/drag 方向
  target?: Point;             // drag 目标点（相对媒体框）
  snap?: boolean;             // drag 是否吸附目标
  angle?: number;             // rotate 目标角度(度)
  tolerance?: number;         // rotate 角度容差 / trace 命中半径
  count?: number;             // rapidtap 需要次数
  decay?: number;             // rapidtap 每帧衰减
  beats?: number[];           // rhythm 节拍时间点(ms)
  points?: Point[];           // trace 途经点（相对媒体框）
}

export interface StoryTree {
  meta: StoryMeta;
  config?: StoryConfig;   // 故事级配置分区（合并自原 story.config.json，可选）
  variables?: Variables;
  items?: ItemDef[];
  characters?: CharacterDef[];
  nodes: Record<string, StoryNode>;
}

export interface StoryConfig {
  title: string;
  subtitle?: string;
  locale?: "zh-CN" | "en"; // 引擎 UI 语言，由创作方指定；缺省 zh-CN
  poster?: string; // 标题页封面图 URL
  theme?: { mode?: "light" | "dark"; accent?: string; preset?: ThemePreset };
  typography?: { textSpeed?: "slow" | "normal" | "fast" | "instant" };
  audio?: { bgm?: string; bgmVolume?: number; sfxVolume?: number }; // bgm=全局背景音 URL（贯穿整个游戏，节点级 bgm 可覆盖）
  features?: {
    backlog?: boolean; gallery?: boolean; inventory?: boolean;
    autosave?: boolean; saveSlots?: number;
  };
  skin?: {
    choiceStyle?: Skin;
    frame?: string;      // 全局共享装饰底图 URL
    font?: "sans" | "serif";
    accent?: string;
  };
  motion?: {
    transition?: Transition;
    choiceReveal?: ChoiceReveal;
    textStyle?: TextStyle;
    intensity?: "subtle" | "normal" | "cinematic";
    reducedMotion?: "auto" | "on" | "off";
  };
}

export interface BacklogEntry { nodeId: string; text: string; }
export interface Settings {
  textSpeed: "slow" | "normal" | "fast" | "instant";
  bgmVolume: number; sfxVolume: number;
}
export interface SaveData {
  slot: number; name: string; savedAt: number;
  currentNodeId: string; variables: Variables; inventory: string[];
  visited: string[]; backlog: BacklogEntry[]; history: string[];
}
