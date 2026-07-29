import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useStoryEngine } from "@/engine/useStoryEngine";
import { Button } from "@/components/ui/button";
import { SettingsPanel } from "@/components/story/SettingsPanel";
import "@/components/story/themes.css";

export default function TitleScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { state, actions } = useStoryEngine();
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (state.status === "empty")
    return (
      <div className="dark flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0f1115] px-8 text-center text-foreground">
        <h1 className="font-bold" style={{ fontSize: "var(--font-size-headline)" }}>{t("empty.engineTitle")}</h1>
        <p className="max-w-md text-muted-foreground">
          {t("empty.noStoryPrefix")}<code>frontend/public/story/story.json</code>{t("empty.noStorySuffix")}
        </p>
      </div>
    );

  if (state.status !== "ready" || !state.tree || !state.config)
    return <div className="dark flex min-h-screen items-center justify-center bg-black text-muted-foreground">
      {state.status === "error" ? t("common.loadFailed", { error: state.error ?? "" }) : t("common.loading")}
    </div>;

  const cfg = state.config;
  const saves = actions.listSaves();
  const hasAuto = !!saves[0];
  const poster = cfg.poster || undefined; // 封面 URL（直接使用）
  const themePreset = cfg.theme?.preset ?? "minimal";
  const themeFont = cfg.skin?.font ?? (themePreset === "horror" || themePreset === "fantasy" ? "serif" : "sans");

  return (
    <div
      data-ifg-theme={themePreset}
      className={`dark ifg-stage-bg relative flex h-screen flex-col items-center justify-center overflow-hidden text-foreground ${themeFont === "serif" ? "ifg-font-serif" : ""}`}
    >
      {poster && (
        <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      )}
      <div className="relative z-10 flex flex-col items-center gap-5 text-center">
        <h1
          className="font-bold [text-shadow:_0_2px_18px_rgba(0,0,0,0.6)]"
          style={{ fontSize: "var(--font-size-display)" }}
        >
          {cfg.title}
        </h1>
        <span className="ifg-accent-rule" aria-hidden />
        {cfg.subtitle && (
          <p style={{ fontSize: "var(--font-size-title)", color: "var(--ifg-speaker-fg)" }}>{cfg.subtitle}</p>
        )}
        <div className="mt-4 flex flex-col gap-3">
          <Button size="lg" className="ifg-menu-primary" onClick={() => { actions.start(); navigate("/play"); }}>{t("title.start")}</Button>
          {hasAuto && <Button size="lg" className="ifg-menu-secondary"
            onClick={() => { actions.loadSave(saves[0]); navigate("/play"); }}>{t("title.continue")}</Button>}
          {cfg.features?.gallery !== false && <Button size="lg" className="ifg-menu-ghost" onClick={() => navigate("/gallery")}>{t("title.gallery")}</Button>}
          <Button size="lg" className="ifg-menu-ghost" onClick={() => setSettingsOpen(true)}>{t("title.settings")}</Button>
        </div>
      </div>
      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} settings={state.settings} onChange={actions.updateSettings} />
    </div>
  );
}
