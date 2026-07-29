import type { Choice, Skin } from "@/engine/types";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./skins.css";

interface Props {
  mode: "advance" | "choice";
  choices?: Choice[];
  skin?: Skin;
  accent?: string;
  onAdvance: () => void;
  onChoose: (choice: Choice) => void;
}

export function ChoiceLayer({ mode, choices, skin = "ribbon", accent, onAdvance, onChoose }: Props) {
  const { t } = useTranslation();
  const style = accent ? ({ "--ifg-accent": accent } as React.CSSProperties) : undefined;
  return (
    <div className="ifg-choice-bar">
      {mode === "advance" ? (
        <button type="button" className={`ifg-choice ifg-choice-row ifg-skin-${skin}`} style={style} onClick={onAdvance}>
          <span className="ifg-choice-text">{t("common.continue")}</span>
          <ChevronRight className="ifg-choice-chevron size-4 shrink-0" />
        </button>
      ) : (
        (choices ?? []).map((c, i) => (
          <button key={i} type="button" className={`ifg-choice ifg-choice-row ifg-skin-${c.skin ?? skin}`} style={style} onClick={() => onChoose(c)}>
            <span className="ifg-choice-text">{c.label}</span>
            <ChevronRight className="ifg-choice-chevron size-4 shrink-0" />
          </button>
        ))
      )}
    </div>
  );
}
