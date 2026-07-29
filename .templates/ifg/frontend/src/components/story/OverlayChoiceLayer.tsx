import { motion, type Variants } from "framer-motion";
import type { Choice, ChoiceReveal, Skin } from "@/engine/types";
import { placeholderFallback } from "@/engine/assetPath";
import "./skins.css";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

function itemVariants(reveal: ChoiceReveal): Variants {
  switch (reveal) {
    case "slide-up": return { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };
    case "scale-in": return { hidden: { opacity: 0, scale: 0.9 }, show: { opacity: 1, scale: 1 } };
    case "glow-pulse":
      return { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.4 } } };
    case "typewriter":
    case "stagger-fade":
    default:
      return { hidden: { opacity: 0 }, show: { opacity: 1 } };
  }
}

interface Props {
  choices: Choice[];
  reveal?: ChoiceReveal;
  defaultSkin?: Skin;
  accent?: string;
  /** 全局共享装饰底图占位符（config.skin.frame）。 */
  frame?: string;
  onChoose: (choice: Choice) => void;
}

export function OverlayChoiceLayer({ choices, reveal = "stagger-fade", defaultSkin = "ribbon", accent, frame, onChoose }: Props) {
  const n = choices.length;
  return (
    <motion.div className="ifg-overlay-root" variants={container} initial="hidden" animate="show">
      {choices.map((c, i) => {
        const skin = c.skin ?? defaultSkin;
        // 三级回退：choice.art(URL) → config.skin.frame(URL) → CSS 皮肤
        const artSrc = c.art ?? frame ?? null;
        // 未显式给 anchor 时：纵向居中偏下堆叠（避开最底部字幕带，且互不重叠）
        const anchor = c.anchor ?? { x: 0.5, y: 0.5 + (i - (n - 1) / 2) * 0.13 };
        const useArt = !!artSrc;
        return (
          <motion.button
            key={i}
            type="button"
            variants={itemVariants(reveal)}
            className={`ifg-choice ${useArt ? "ifg-choice-art" : `ifg-choice-float ifg-skin-${skin}`}${reveal === "glow-pulse" ? " ifg-glow" : ""}`}
            style={{
              position: "absolute",
              left: `${anchor.x * 100}%`,
              top: `${anchor.y * 100}%`,
              transform: "translate(-50%, -50%)",
              ...(accent ? ({ "--ifg-accent": accent } as React.CSSProperties) : {}),
            }}
            animate={reveal === "glow-pulse"
              ? { opacity: 1, boxShadow: ["0 0 0 rgba(201,162,75,0)", "0 0 18px rgba(201,162,75,0.7)", "0 0 0 rgba(201,162,75,0)"] }
              : undefined}
            transition={reveal === "glow-pulse" ? { repeat: Infinity, duration: 2 } : undefined}
            onClick={() => onChoose(c)}
          >
            {useArt && (
              <img
                src={artSrc!}
                alt=""
                className="ifg-choice-art-img"
                onError={(e) => { const fb = placeholderFallback("image"); if (fb) e.currentTarget.src = fb; }}
              />
            )}
            <span className="ifg-choice-label">{c.label}</span>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
