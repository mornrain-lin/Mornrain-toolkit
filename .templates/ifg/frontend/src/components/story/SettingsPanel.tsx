import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { useTranslation } from "react-i18next";
import { useStoryEngine } from "@/engine/useStoryEngine";
import { useIfgTheme } from "@/components/story/useIfgTheme";
import type { Settings } from "@/engine/types";
import "@/components/story/themes.css";

const SPEEDS: Settings["textSpeed"][] = ["slow", "normal", "fast", "instant"];

export function SettingsPanel({ open, onOpenChange, settings, onChange }: {
  open: boolean; onOpenChange: (v: boolean) => void; settings: Settings; onChange: (s: Settings) => void;
}) {
  const { t } = useTranslation();
  const { state } = useStoryEngine();
  const { preset, serif } = useIfgTheme(state.config);
  const speedLabel = (sp: Settings["textSpeed"]) => t(`settings.speed.${sp}`);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-ifg-theme={preset} className={`ifg-dialog max-w-md ${serif ? "ifg-font-serif" : ""}`}>
        <DialogHeader><DialogTitle>{t("settings.title")}</DialogTitle></DialogHeader>
        <div className="space-y-6 py-2">
          <div>
            <div className="mb-2 text-sm">{t("settings.textSpeed", { label: speedLabel(settings.textSpeed) })}</div>
            <div className="flex gap-2">
              {SPEEDS.map((sp) => (
                <button key={sp}
                  className={`rounded-md px-3 py-1 text-sm ${sp === settings.textSpeed ? "ifg-seg ifg-seg-active" : "ifg-seg"}`}
                  onClick={() => onChange({ ...settings, textSpeed: sp })}>
                  {speedLabel(sp)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm">{t("settings.bgmVolume", { percent: Math.round(settings.bgmVolume * 100) })}</div>
            <Slider className="ifg-slider" value={[settings.bgmVolume * 100]} max={100} step={1}
              onValueChange={([v]: number[]) => onChange({ ...settings, bgmVolume: v / 100 })} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
