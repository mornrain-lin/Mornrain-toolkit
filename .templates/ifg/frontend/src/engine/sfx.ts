/** 播放一次性音效（sfx）。直接使用素材 URL。失败静默。 */
export function playSfx(url: string, volume = 0.8): void {
  try {
    const el = new Audio(url);
    el.volume = Math.max(0, Math.min(1, volume));
    void el.play().catch(() => {});
  } catch {
    /* 忽略 */
  }
}
