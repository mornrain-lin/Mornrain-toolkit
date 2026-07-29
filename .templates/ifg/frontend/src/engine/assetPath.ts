import type { Kind } from "./types";

/**
 * 素材未落盘 / URL 加载失败时的通用占位兜底（image / video 各一张，随框架内置于
 * public/assets/placeholder/；audio 无兜底）。
 */
export function placeholderFallback(kind: Kind): string | null {
  if (kind === "image") return "/assets/placeholder/image.png";
  if (kind === "video") return "/assets/placeholder/video.png";
  return null;
}

/** 从字幕 URL 扩展名推断格式（供播放器 subtitle.switch 用），无法识别时默认 vtt。 */
export function subtitleType(url: string): "vtt" | "srt" | "ass" {
  const clean = url.split(/[?#]/)[0].toLowerCase();
  if (clean.endsWith(".ass")) return "ass";
  if (clean.endsWith(".srt")) return "srt";
  return "vtt";
}
