import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "react-i18next";
import { useStoryEngine } from "@/engine/useStoryEngine";
import { useIfgTheme } from "@/components/story/useIfgTheme";
import type { BacklogEntry } from "@/engine/types";
import "@/components/story/themes.css";

export function Backlog({ open, onOpenChange, entries }: {
  open: boolean; onOpenChange: (v: boolean) => void; entries: BacklogEntry[];
}) {
  const { t } = useTranslation();
  const { state } = useStoryEngine();
  const { preset, serif } = useIfgTheme(state.config);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-ifg-theme={preset} className={`ifg-dialog max-w-lg ${serif ? "ifg-font-serif" : ""}`}>
        <DialogHeader><DialogTitle>{t("backlog.title")}</DialogTitle></DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-3">
            {entries.length === 0 ? <p className="opacity-60">{t("backlog.empty")}</p> :
              entries.map((e, i) => <p key={i} className="text-sm leading-relaxed">{e.text}</p>)}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
