import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useStoryEngine } from "@/engine/useStoryEngine";
import { loadUnlockedEndings } from "@/engine/storage";
import { EndingCard } from "@/components/story/EndingCard";
import { Button } from "@/components/ui/button";
import type { EndingType } from "@/engine/types";
import "@/components/story/themes.css";

export default function GalleryScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { state } = useStoryEngine();
  if (state.status !== "ready" || !state.tree)
    return <div className="dark flex min-h-screen items-center justify-center bg-black text-muted-foreground">{t("common.loading")}</div>;

  const endings = Object.entries(state.tree.nodes).filter(([, n]) => n.type === "ending");
  // 从 localStorage 读取最新解锁（含刚触达的结局）
  const unlocked = new Set(loadUnlockedEndings(state.tree.meta));
  const themePreset = state.config?.theme?.preset ?? "minimal";
  const themeFont = state.config?.skin?.font ?? (themePreset === "horror" || themePreset === "fantasy" ? "serif" : "sans");

  return (
    <div
      data-ifg-theme={themePreset}
      className={`dark ifg-stage-bg h-screen overflow-y-auto px-8 py-10 text-foreground ${themeFont === "serif" ? "ifg-font-serif" : ""}`}
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="ifg-accent-rule" aria-hidden />
            <h2 className="font-bold" style={{ fontSize: "var(--font-size-headline)" }}>{t("gallery.title")}</h2>
          </div>
          <span className="font-semibold" style={{ color: "var(--ifg-accent)" }}>{unlocked.size} / {endings.length}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {endings.map(([id, n]) => (
            <EndingCard key={id} endingType={(n.ending_type ?? "normal") as EndingType}
              text={n.text} locked={!unlocked.has(id)} />
          ))}
        </div>
        <div className="flex justify-center gap-3 pt-4">
          <Button className="ifg-menu-secondary" onClick={() => navigate("/")}>{t("common.backToTitle")}</Button>
        </div>
      </div>
    </div>
  );
}
