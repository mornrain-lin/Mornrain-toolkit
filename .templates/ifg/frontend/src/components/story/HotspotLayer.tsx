import type { Choice } from "@/engine/types";
import "./skins.css";

interface Props {
  choices: Choice[];
  onChoose: (choice: Choice) => void;
}

export function HotspotLayer({ choices, onChoose }: Props) {
  return (
    <div className="ifg-overlay-root">
      {choices.map((c, i) => {
        const r = c.region ?? { x: 0, y: 0, w: 1, h: 1 };
        return (
          <button
            key={i}
            type="button"
            aria-label={c.label}
            className="ifg-hotspot"
            style={{
              position: "absolute",
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: `${r.w * 100}%`,
              height: `${r.h * 100}%`,
            }}
            onClick={() => onChoose(c)}
          >
            {c.hint && <span className="ifg-hotspot-hint">{c.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
