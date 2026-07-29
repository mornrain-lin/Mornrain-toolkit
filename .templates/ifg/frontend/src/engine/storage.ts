import type { SaveData, Settings, StoryMeta } from "./types";

const DEFAULT_SETTINGS: Settings = { textSpeed: "normal", bgmVolume: 0.6, sfxVolume: 0.8 };

function ns(meta: StoryMeta): string {
  return `ifg:${meta.title}:${meta.version}`;
}
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 存储不可用则忽略 */ }
}

// ---- 存档槽（slot 0 约定为自动存档）----
export function loadSaves(meta: StoryMeta): Record<number, SaveData> {
  return read<Record<number, SaveData>>(`${ns(meta)}:saves`, {});
}
export function writeSave(meta: StoryMeta, save: SaveData): void {
  const all = loadSaves(meta);
  all[save.slot] = save;
  write(`${ns(meta)}:saves`, all);
}
export function deleteSave(meta: StoryMeta, slot: number): void {
  const all = loadSaves(meta);
  delete all[slot];
  write(`${ns(meta)}:saves`, all);
}

// ---- 结局图鉴（跨存档累计）----
export function loadUnlockedEndings(meta: StoryMeta): string[] {
  return read<string[]>(`${ns(meta)}:gallery`, []);
}
export function unlockEnding(meta: StoryMeta, nodeId: string): string[] {
  const cur = loadUnlockedEndings(meta);
  if (!cur.includes(nodeId)) cur.push(nodeId);
  write(`${ns(meta)}:gallery`, cur);
  return cur;
}

// ---- 设置 ----
export function loadSettings(meta: StoryMeta): Settings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(`${ns(meta)}:settings`, {}) };
}
export function writeSettings(meta: StoryMeta, settings: Settings): void {
  write(`${ns(meta)}:settings`, settings);
}
export { DEFAULT_SETTINGS };
