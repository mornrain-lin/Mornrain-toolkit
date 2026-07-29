import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { History, Save, Settings as SettingsIcon, Home } from "lucide-react";

export function Hud({ onBacklog, onSave, onSettings, onTitle, showBacklog }: {
  onBacklog: () => void; onSave: () => void; onSettings: () => void; onTitle: () => void; showBacklog: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="absolute right-4 top-4 z-10 flex gap-2">
      {showBacklog && <Button size="icon" variant="secondary" className="ifg-hud-btn" onClick={onBacklog} title={t("hud.backlog")}><History className="size-4" /></Button>}
      <Button size="icon" variant="secondary" className="ifg-hud-btn" onClick={onSave} title={t("hud.save")}><Save className="size-4" /></Button>
      <Button size="icon" variant="secondary" className="ifg-hud-btn" onClick={onSettings} title={t("hud.settings")}><SettingsIcon className="size-4" /></Button>
      <Button size="icon" variant="secondary" className="ifg-hud-btn" onClick={onTitle} title={t("hud.title")}><Home className="size-4" /></Button>
    </div>
  );
}
