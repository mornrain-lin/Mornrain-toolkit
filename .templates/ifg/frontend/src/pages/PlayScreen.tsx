import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useStoryEngine } from "@/engine/useStoryEngine";
import { FxProvider, useFx } from "@/engine/fx";
import { resolveReducedMotion } from "@/engine/motion";
import type { ContentBox } from "@/engine/useContentBox";
import type { MediaRef } from "@/engine/types";
import { MediaLayer, type MediaStatus } from "@/components/story/MediaLayer";
import { BgmPlayer } from "@/components/story/BgmPlayer";
import { TextLayer } from "@/components/story/TextLayer";
import { ChoiceLayer } from "@/components/story/ChoiceLayer";
import { OverlayChoiceLayer } from "@/components/story/OverlayChoiceLayer";
import { HotspotLayer } from "@/components/story/HotspotLayer";
import { InteractionLayer } from "@/components/story/InteractionLayer";
import { TransitionStage } from "@/components/story/TransitionStage";
import { StageFx } from "@/components/story/FxLayer";
import { InventoryBar } from "@/components/story/InventoryBar";
import { Hud } from "@/components/story/Hud";
import { Backlog } from "@/components/story/Backlog";
import { SaveLoadPanel } from "@/components/story/SaveLoadPanel";
import { SettingsPanel } from "@/components/story/SettingsPanel";
import { EndingCard } from "@/components/story/EndingCard";
import { Button } from "@/components/ui/button";
import "@/components/story/themes.css";

export default function PlayScreen() {
  return (
    <FxProvider>
      <PlayInner />
    </FxProvider>
  );
}

// 无真实视频/图片时，按 kind 的兜底片段时长（秒）
const DEFAULT_SECS: Record<string, number> = { image: 5, video: 6, audio: 5 };

function PlayInner() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { state, currentNode, availableChoices, actions } = useStoryEngine();
  const { runFx } = useFx();
  const [backlogOpen, setBacklogOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ---- 视频时间轴驱动 ----
  const [clock, setClock] = useState(0);                 // 当前片段已播秒数（真实视频由 onTime 同步，否则 interval 走）
  const [status, setStatus] = useState<MediaStatus>({ kind: null, hasRealMedia: false, duration: null });
  const [revealed, setRevealed] = useState(false);       // choice/interaction 是否已浮现
  const resolvedRef = useRef(false);                     // scene 是否已推进（防重复）
  const seenRef = useRef<Set<string>>(new Set());        // 本会话已经过的节点
  const [skipAllowed, setSkipAllowed] = useState(false); // 跳过仅在重访已见过节点时可用（防一周目误跳）
  const lastMediaRef = useRef<MediaRef | undefined>(undefined); // 上一个有媒体节点的 media（供无媒体的 choice/interaction 继承并定格）

  const reduced = useMemo(() => resolveReducedMotion(state.config), [state.config]);

  useEffect(() => {
    setClock(0); setRevealed(false); resolvedRef.current = false;
    setStatus({ kind: null, hasRealMedia: false, duration: null });
    const id = state.currentNodeId;
    if (id) { setSkipAllowed(seenRef.current.has(id)); seenRef.current.add(id); }
    else setSkipAllowed(false);
  }, [state.currentNodeId]);

  useEffect(() => {
    if (state.status === "ready" && !state.currentNodeId) navigate("/", { replace: true });
  }, [state.status, state.currentNodeId, navigate]);

  const usingRealVideo = status.kind === "video" && status.hasRealMedia && !!status.duration && status.duration > 0;
  const hasClip = typeof currentNode?.clipDuration === "number" && currentNode.clipDuration > 0;

  const nodeType = currentNode?.type;
  const isEnding = nodeType === "ending";
  const isInteraction = nodeType === "interaction";
  // 决策点判定改为"是否内嵌 choices"（选项内嵌于该幕视频，不再是独立 choice 节点）
  const isDecision = !!(currentNode?.choices && currentNode.choices.length > 0);
  const awaitsInput = isDecision || isInteraction; // 需玩家输入 → 不自动推进、到点浮现选项/手势
  // 决策/交互若无自有视频，则继承上一段视频、定格最后一帧作背景（选项/字幕融入画面而非黑屏）
  const ownMedia = currentNode?.media;
  const inheritFrozen = !ownMedia && awaitsInput && !!lastMediaRef.current;
  const effectiveMedia = ownMedia ?? (inheritFrozen ? lastMediaRef.current : undefined);

  // 记录最近一个有媒体节点的 media（渲染后更新，故当前无媒体节点读到的是上一段）
  useEffect(() => {
    if (currentNode?.media) lastMediaRef.current = currentNode.media;
  }, [state.currentNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 时钟驱动源：显式 clipDuration ⇒ 以剧本规划为准（wall-clock）；否则真实视频为准（onTime/ended）；
  // 定格继承帧（无 timeupdate）一律用 wall-clock，避免时钟卡死导致选项不浮现。
  const videoDriven = usingRealVideo && !hasClip && !inheritFrozen;

  // 非视频驱动用 wall-clock 走时钟；真实视频且无 clipDuration 时由 onTime 驱动
  useEffect(() => {
    if (videoDriven) return;
    const id = setInterval(() => setClock((c) => c + 0.1), 100);
    return () => clearInterval(id);
  }, [videoDriven, state.currentNodeId]);

  // 进入非交互节点时触发其反馈 fx（交互节点在完成时触发）
  useEffect(() => {
    if (!currentNode || currentNode.type === "interaction") return;
    if (currentNode.fx) runFx(currentNode.fx, state.settings.sfxVolume);
  }, [state.currentNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fallbackSecs = DEFAULT_SECS[status.kind ?? ""] ?? 4;
  const target = currentNode?.clipDuration ?? (usingRealVideo ? (status.duration as number) : fallbackSecs);
  // 定格继承帧时无需等待，选项尽快浮现；否则按 choiceAt/片段末尾
  const revealAt = currentNode?.choiceAt ?? (inheritFrozen ? 0.2 : target);

  // 时钟推进 → scene 自动进下一幕 / 决策点·交互到点浮现
  useEffect(() => {
    if (!currentNode || isEnding) return;
    if (awaitsInput) {
      if (!revealed && clock >= revealAt) setRevealed(true);
      return;
    }
    if (!videoDriven && !resolvedRef.current && clock >= target) {
      resolvedRef.current = true;
      actions.advance();
    }
  }, [clock, revealed, revealAt, target, videoDriven, awaitsInput, isEnding, currentNode, actions]);

  if (state.status === "loading" || state.status === "idle")
    return <div className="dark flex min-h-screen items-center justify-center bg-black text-muted-foreground">{t("common.loading")}</div>;
  if (state.status === "empty")
    return <div className="dark flex min-h-screen items-center justify-center bg-black text-muted-foreground">{t("empty.noStoryShort")}</div>;
  if (state.status === "error")
    return <div className="dark flex min-h-screen items-center justify-center bg-black text-destructive">{t("common.loadFailed", { error: state.error ?? "" })}</div>;
  if (!currentNode || !state.tree || !state.currentNodeId) return null;

  const cfg = state.config;
  const features = cfg?.features ?? {};
  const motionCfg = cfg?.motion;
  const transition = currentNode.transition ?? motionCfg?.transition;
  const reveal = currentNode.choiceReveal ?? motionCfg?.choiceReveal;
  const textStyle = currentNode.textStyle ?? motionCfg?.textStyle;
  const defaultSkin = cfg?.skin?.choiceStyle ?? "ribbon";
  const accent = cfg?.skin?.accent;
  const frame = cfg?.skin?.frame;
  const layout = currentNode.layout ?? "bar";

  // 成套主题：根容器挂 data-ifg-theme 即整体换皮；字体默认随主题（horror/fantasy 用衬线），config.skin.font 可覆盖
  const themePreset = cfg?.theme?.preset ?? "minimal";
  const themeFont = cfg?.skin?.font ?? (themePreset === "horror" || themePreset === "fantasy" ? "serif" : "sans");

  const resolveSpeaker = (id?: string) =>
    id ? state.tree!.characters?.find((c) => c.id === id)?.name ?? id : undefined;
  const speakerName = resolveSpeaker(currentNode.speaker);

  // 字幕分工：视频节点字幕交由 ArtPlayer 从同 ID 字幕文件（.vtt/.srt/.ass）渲染；
  // 非视频节点（图片/纯旁白）的 text 仍由 TextLayer 叠加显示。
  const isVideoNode = effectiveMedia?.type === "video";
  const subtitleText = isVideoNode ? undefined : currentNode.text;
  const subtitleSpeaker = speakerName;
  const subtitleSpeed = currentNode.typewriter ? state.settings.textSpeed : "instant";

  const mediaLoop = awaitsInput;
  const hasOverlay = isInteraction || (isDecision && layout !== "bar");
  const showChoiceBar = isDecision && layout === "bar" && revealed;

  const handleEnded = () => {
    if (isEnding) return;
    if (awaitsInput) { setRevealed(true); return; }
    if (hasClip) return; // 有 clipDuration ⇒ 以规划时钟在 target 推进，视频自身结束不触发推进
    if (!resolvedRef.current) { resolvedRef.current = true; actions.advance(); }
  };

  const skip = () => {
    if (isEnding) return;
    if (awaitsInput) { setRevealed(true); return; }
    if (!resolvedRef.current) { resolvedRef.current = true; actions.advance(); }
  };

  const renderOverlay = (_box: ContentBox) => {
    if (!revealed) return null;
    if (isInteraction)
      return <InteractionLayer node={currentNode} onComplete={() => { if (currentNode.fx) runFx(currentNode.fx, state.settings.sfxVolume); actions.advance(); }} />;
    if (isDecision && layout === "overlay")
      return <OverlayChoiceLayer choices={availableChoices} reveal={reveal} defaultSkin={defaultSkin} accent={accent} frame={frame} onChoose={actions.choose} />;
    if (isDecision && layout === "hotspots")
      return <HotspotLayer choices={availableChoices} onChoose={actions.choose} />;
    return null;
  };

  const showSkip = !isEnding && !(mediaLoop && revealed) && skipAllowed;

  return (
    <div
      data-ifg-theme={themePreset}
      className={`dark relative flex h-screen flex-col overflow-hidden bg-[#0f1115] text-foreground ${themeFont === "serif" ? "ifg-font-serif" : ""}`}
    >
      <BgmPlayer bgm={currentNode.bgm ?? cfg?.audio?.bgm} volume={state.settings.bgmVolume} />
      <Hud
        showBacklog={features.backlog !== false}
        onBacklog={() => setBacklogOpen(true)}
        onSave={() => setSaveOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onTitle={() => navigate("/")}
      />
      <StageFx>
        <TransitionStage nodeId={state.currentNodeId} transition={transition} reduced={reduced}>
          <div className="relative flex min-h-0 flex-1 flex-col">
            <MediaLayer
              media={effectiveMedia}
              renderOverlay={hasOverlay ? renderOverlay : undefined}
              onTime={(t) => { if (videoDriven) setClock(t); }}
              onEnded={handleEnded}
              onStatus={setStatus}
              loop={mediaLoop && !inheritFrozen}
              freeze={inheritFrozen}
              volume={1}
            />
            {isEnding ? (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/60 px-8">
                <EndingCard endingType={currentNode.ending_type ?? "normal"} text={currentNode.text} />
                <div className="flex justify-center gap-3">
                  <Button className="ifg-menu-primary" onClick={() => actions.restart()}>{t("play.restart")}</Button>
                  {features.gallery !== false && <Button className="ifg-menu-secondary" onClick={() => navigate("/gallery")}>{t("play.gallery")}</Button>}
                  <Button className="ifg-menu-ghost" onClick={() => navigate("/")}>{t("common.backToTitle")}</Button>
                </div>
              </div>
            ) : (
              /* 底部信息区（库存 + 旁白 + bar 选项）恒定钉在视口底部，
                 不随媒体 letterbox 画面框高度变化——彻底消除旁白/选项忽高忽低。 */
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col justify-end gap-1 bg-gradient-to-t from-black/92 via-black/55 to-transparent px-4 pt-24 pb-5">
                {features.inventory !== false && state.tree.items && (
                  <InventoryBar items={state.tree.items} inventory={state.inventory} />
                )}
                <TextLayer text={subtitleText} speed={subtitleSpeed} textStyle={textStyle} speaker={subtitleSpeaker} />
                {showChoiceBar && (
                  <div className="pointer-events-auto mt-1">
                    <ChoiceLayer
                      mode="choice"
                      choices={availableChoices}
                      skin={defaultSkin}
                      accent={accent}
                      onAdvance={actions.advance}
                      onChoose={actions.choose}
                    />
                  </div>
                )}
              </div>
            )}
            {showSkip && (
              <button
                onClick={skip}
                className="ifg-hud-btn absolute bottom-4 right-4 z-40 rounded-full px-4 py-1.5 text-[13px] transition"
              >
                {t("play.skip")}
              </button>
            )}
          </div>
        </TransitionStage>
      </StageFx>

      <Backlog open={backlogOpen} onOpenChange={setBacklogOpen} entries={state.backlog} />
      <SaveLoadPanel open={saveOpen} onOpenChange={setSaveOpen}
        slots={features.saveSlots ?? 3} saves={actions.listSaves()}
        onSave={(slot) => actions.saveTo(slot, t("play.saveName", { slot }))}
        onLoad={(s) => { actions.loadSave(s); setSaveOpen(false); }} />
      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen}
        settings={state.settings} onChange={actions.updateSettings} />
    </div>
  );
}
