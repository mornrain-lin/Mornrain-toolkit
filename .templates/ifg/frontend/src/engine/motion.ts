import type { StoryConfig } from "./types";

/** 是否应减弱动效（无障碍）：config.reducedMotion 优先，auto 时跟随系统。 */
export function resolveReducedMotion(config?: StoryConfig): boolean {
  const pref = config?.motion?.reducedMotion ?? "auto";
  if (pref === "on") return true;
  if (pref === "off") return false;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  return false;
}

/** 动效强度系数：subtle<normal<cinematic。 */
export function intensityScale(config?: StoryConfig): number {
  switch (config?.motion?.intensity) {
    case "subtle": return 0.5;
    case "cinematic": return 1.6;
    default: return 1;
  }
}
