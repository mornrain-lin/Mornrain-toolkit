import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useStoryEngine } from "@/engine/useStoryEngine";
import { useIfgTheme } from "@/components/story/useIfgTheme";
import "@/components/story/themes.css";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();
  const { state } = useStoryEngine();
  const { preset, serif } = useIfgTheme(state.config);

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div
      data-ifg-theme={preset}
      className={`ifg-stage-bg dark flex min-h-screen items-center justify-center text-foreground ${serif ? "ifg-font-serif" : ""}`}
    >
      <div className="flex flex-col items-center text-center">
        <h1
          className="font-bold [text-shadow:_0_2px_18px_rgba(0,0,0,0.6)]"
          style={{ fontSize: 'var(--font-size-display)', marginBottom: 'var(--spacing-md)' }}
        >
          404
        </h1>
        <span className="ifg-accent-rule" aria-hidden style={{ marginBottom: 'var(--spacing-md)' }} />
        <p
          style={{ fontSize: 'var(--font-size-headline)', marginBottom: 'var(--spacing-md)', color: 'var(--ifg-speaker-fg)' }}
        >
          {t("notFound.message")}
        </p>
        <a href="/" className="underline" style={{ color: 'var(--ifg-accent)' }}>
          {t("notFound.backHome")}
        </a>
      </div>
    </div>
  );
};

export default NotFound;
