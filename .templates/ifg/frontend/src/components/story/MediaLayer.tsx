import { useEffect, useRef, useState } from "react";
import Artplayer from "artplayer";
import { useTranslation } from "react-i18next";
import { placeholderFallback, subtitleType } from "@/engine/assetPath";
import { useContentBox, type ContentBox } from "@/engine/useContentBox";
import type { Kind, MediaRef } from "@/engine/types";

export interface MediaStatus {
  kind: Kind | null;
  hasRealMedia: boolean; // 真实素材是否可播（video 元数据加载成功 / image 加载成功）
  duration: number | null; // 真实视频时长(秒)
}

interface Props {
  /** 本幕媒体：{ type, src(URL), subtitle?(URL) }。 */
  media?: MediaRef;
  /** 在媒体实际内容框上渲染叠层（选项/热区/交互控件）。 */
  renderOverlay?: (box: ContentBox) => React.ReactNode;
  /** 视频播放进度回调（秒）。 */
  onTime?: (seconds: number) => void;
  /** 视频自然播放结束回调（loop=false 时才会触发）。 */
  onEnded?: () => void;
  /** 媒体状态回调：供上层判断用视频驱动还是 duration 兜底。 */
  onStatus?: (s: MediaStatus) => void;
  /** 是否循环（决策点/交互点循环等待玩家操作）。 */
  loop?: boolean;
  /** 定格：不自动播放，seek 到最后一帧并暂停（供无自有视频的 choice/interaction 继承上一段作静态背景）。 */
  freeze?: boolean;
  /** 视频语音音量 0~1。 */
  volume?: number;
  /** 内容框（letterbox 后视频/图片的实际显示区域）变化回调，供上层将选项叠到画面框上。 */
  onBox?: (box: ContentBox) => void;
}

// 只注入一次：互动影片模式——隐藏 ArtPlayer 控件/进度条/中央按钮（叙事由逻辑时钟推进，不允许拖动破坏时序），
// 视频 object-contain 与引擎 letterbox 对齐；仅保留字幕层由播放器渲染。
// pointer-events:none —— 关闭点击视频切换播放/暂停（时序由逻辑时钟掌控，不接受玩家点击干预）。
const STYLE_ID = "ifg-artplayer-style";
function ensureArtStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent =
    ".art-video-player .art-bottom,.art-video-player .art-mask,.art-video-player .art-state{display:none!important}" +
    ".art-video-player{cursor:default!important;pointer-events:none!important}" +
    ".art-video-player .art-video{object-fit:contain}";
  document.head.appendChild(s);
}

export function MediaLayer({ media, renderOverlay, onTime, onEnded, onStatus, loop = false, freeze = false, volume = 1, onBox }: Props) {
  const { t } = useTranslation();
  const [fellBack, setFellBack] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null);
  const [forcedMute, setForcedMute] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<Artplayer | null>(null);
  const box = useContentBox(containerRef, fellBack ? null : ratio);

  useEffect(() => { onBox?.(box); }, [box.left, box.top, box.width, box.height]); // eslint-disable-line react-hooks/exhaustive-deps

  const kind = media?.type ?? null;
  const src = media?.src ?? "";
  const fallback = kind ? placeholderFallback(kind) : null;

  useEffect(() => { setFellBack(false); setRatio(null); setForcedMute(false); }, [src]);

  // 无媒体节点：立即上报状态，供上层用 duration 兜底推进
  useEffect(() => {
    if (!kind) onStatus?.({ kind: null, hasRealMedia: false, duration: null });
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  // video 节点：ArtPlayer 负责播放；字幕直接用 media.subtitle（URL）渲染，多格式
  useEffect(() => {
    if (kind !== "video" || !playerRef.current) return;
    ensureArtStyle();
    let disposed = false;

    const art = new Artplayer({
      container: playerRef.current,
      url: src,
      volume,
      autoplay: false,          // 手动播放以便统一处理自动播放被拦截的降级
      loop: loop && !freeze,
      muted: false,
      moreVideoAttr: { playsInline: true, "webkit-playsinline": "true" } as Record<string, unknown>,
      // 纯净沉浸：关闭一切内置控件/交互入口
      hotkey: false,            // 关闭键盘快捷键（空格播放/暂停、方向键 seek/音量）
      controls: [],
      layers: [],
      contextmenu: [],
      settings: [],
      setting: false,
      playbackRate: false,
      aspectRatio: false,
      fullscreen: false,
      fullscreenWeb: false,
      pip: false,
      miniProgressBar: false,
      autoSize: false,
      autoPlayback: false,
      theme: "#ffffff",
      subtitle: { style: { fontSize: "2.4vmin" } },
    });
    artRef.current = art;

    const handleReady = () => {
      if (disposed) return;
      const v = art.video;
      if (v.videoWidth) setRatio(v.videoWidth / v.videoHeight);
      const d = v.duration;
      onStatus?.({ kind: "video", hasRealMedia: true, duration: isFinite(d) && d > 0 ? d : null });

      if (freeze) {
        if (isFinite(d) && d > 0) { try { art.seek = Math.max(d - 0.05, 0); } catch { /* noop */ } }
        art.pause();
      } else {
        art.play().catch(() => {
          // 有声自动播放被浏览器拦截 → 静音重试并提示玩家开启声音
          art.muted = true; setForcedMute(true); art.play().catch(() => { /* noop */ });
        });
      }

      // 字幕：直接用节点给的 subtitle URL（COS），格式按扩展名推断
      if (media?.subtitle) {
        try { art.subtitle.switch(media.subtitle, { type: subtitleType(media.subtitle) }); } catch { /* noop */ }
      }
    };

    art.on("ready", handleReady);
    art.on("video:timeupdate", () => { if (!disposed) onTime?.(art.currentTime); });
    art.on("video:ended", () => { if (!disposed) onEnded?.(); });
    art.on("error", () => {
      if (disposed) return;
      setFellBack(true);
      onStatus?.({ kind: "video", hasRealMedia: false, duration: null });
    });

    return () => {
      disposed = true;
      try { art.destroy(false); } catch { /* noop */ }
      artRef.current = null;
    };
  }, [src, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // 音量变化实时同步（不重建实例）
  useEffect(() => {
    const art = artRef.current;
    if (art && !forcedMute) art.volume = volume;
  }, [volume, forcedMute]);

  const enableSound = () => {
    const art = artRef.current;
    if (!art) return;
    art.muted = false; art.volume = volume; setForcedMute(false); art.play().catch(() => { /* noop */ });
  };

  return (
    <div ref={containerRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
      {kind === "video" && (
        <>
          <div ref={playerRef} className="h-full w-full" />
          {fellBack && fallback && (
            <img src={fallback} alt={t("media.sceneAlt")} className="pointer-events-none absolute inset-0 m-auto max-h-full max-w-full object-contain" />
          )}
        </>
      )}
      {fellBack && (
        <span className="absolute right-4 top-4 z-20 rounded-lg border border-amber-300/40 bg-black/60 px-3 py-1.5 text-[13px] text-amber-300">
          {t("media.generating")}
        </span>
      )}
      {forcedMute && kind === "video" && !fellBack && (
        <button
          onClick={enableSound}
          className="absolute left-4 top-4 z-30 rounded-lg border border-white/30 bg-black/60 px-3 py-1.5 text-[13px] text-white backdrop-blur-sm"
        >
          {t("media.enableSound")}
        </button>
      )}
      {renderOverlay && box.width > 0 && (
        <div
          className="pointer-events-none absolute z-30"
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        >
          {renderOverlay(box)}
        </div>
      )}
    </div>
  );
}
