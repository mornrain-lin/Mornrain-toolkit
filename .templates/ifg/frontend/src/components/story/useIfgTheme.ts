import type { StoryConfig, ThemePreset } from "@/engine/types";

/**
 * 从 StoryConfig 解析主题 preset 与是否用衬线字体。
 * 供经 Portal 渲染、脱离 data-ifg-theme 容器的弹窗复用，避免重复此推导逻辑。
 * 字体默认随主题（horror/fantasy 用衬线），config.skin.font 显式覆盖。
 */
export function useIfgTheme(config?: StoryConfig): { preset: ThemePreset; serif: boolean } {
  const preset = config?.theme?.preset ?? "minimal";
  const serif = config?.skin?.font
    ? config.skin.font === "serif"
    : preset === "horror" || preset === "fantasy";
  return { preset, serif };
}
