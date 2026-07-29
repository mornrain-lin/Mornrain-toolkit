import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { useStoryEngine } from "@/engine/useStoryEngine";
import { useIfgTheme } from "@/components/story/useIfgTheme";
import type { SaveData } from "@/engine/types";
import "@/components/story/themes.css";

interface Props {
  open: boolean; onOpenChange: (v: boolean) => void;
  slots: number; saves: Record<number, SaveData>;
  onSave: (slot: number) => void; onLoad: (save: SaveData) => void;
}
export function SaveLoadPanel({ open, onOpenChange, slots, saves, onSave, onLoad }: Props) {
  const rows = Array.from({ length: slots }, (_, i) => i + 1); // slot0 保留给自动存档
  const { t } = useTranslation();
  const { state } = useStoryEngine();
  const { preset, serif } = useIfgTheme(state.config);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-ifg-theme={preset} className={`ifg-dialog max-w-md ${serif ? "ifg-font-serif" : ""}`}>
        <DialogHeader><DialogTitle>{t("save.title")}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {rows.map((slot) => {
            const s = saves[slot];
            return (
              <div key={slot} className="ifg-dialog-row flex items-center justify-between rounded-lg p-3">
                <span className="text-sm">
                  {t("save.slot", { slot })}{s ? ` · ${new Date(s.savedAt).toLocaleString()}` : ` · ${t("save.empty")}`}
                </span>
                <span className="flex gap-2">
                  <Button size="sm" className="ifg-menu-primary" onClick={() => onSave(slot)}>{t("save.save")}</Button>
                  <Button size="sm" className="ifg-menu-secondary" disabled={!s} onClick={() => s && onLoad(s)}>{t("save.load")}</Button>
                </span>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
