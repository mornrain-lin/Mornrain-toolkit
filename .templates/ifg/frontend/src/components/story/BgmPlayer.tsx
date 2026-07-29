import { useEffect, useRef } from "react";

/** 背景音乐播放器。bgm 为可直接访问的音频 URL（如 COS）；同一 URL 不重建、不重启（贯穿）。 */
export function BgmPlayer({ bgm, volume }: { bgm?: string; volume: number }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, volume));
    if (bgm) { el.src = bgm; el.play().catch(() => {}); }
    else { el.pause(); el.removeAttribute("src"); }
  }, [bgm, volume]);
  return <audio ref={ref} loop />;
}
