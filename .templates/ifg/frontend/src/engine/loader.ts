import type { StoryConfig, StoryTree } from "./types";
import i18n from "@/i18n";

export interface LoadedStory { tree?: StoryTree; config: StoryConfig; }

async function getJSON<T>(url: string, optional = false): Promise<T | undefined> {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) {
    if (optional) return undefined;
    throw new Error(i18n.t("error.httpLoad", { url, status: res.status }));
  }
  return (await res.json()) as T;
}

/**
 * 从 /story/story.json 加载剧情数据（单文件，内含可选 config 分区）。
 * 文件缺省（出厂空骨架）时返回 tree=undefined，引擎进入"空态"（请生成剧情），而非报错。
 */
export async function loadStory(base = "/story"): Promise<LoadedStory> {
  const story = await getJSON<StoryTree>(`${base}/story.json`, true);
  if (!story) return { tree: undefined, config: { title: "" } };
  const config = story.config ?? { title: story.meta.title };
  return { tree: story, config };
}
