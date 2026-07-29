import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zhCN from "./locales/zh-CN";
import en from "./locales/en";

export const SUPPORTED_LOCALES = ["zh-CN", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "zh-CN";

// 运行时语言由 story.json 的 config.locale 驱动（见 StoryContext），此处仅提供默认值。
void i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": { translation: zhCN },
    en: { translation: en },
  },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false }, // React 已做 XSS 转义
});

/** 归一化任意输入到受支持的语言，非法值回落默认语言。 */
export function normalizeLocale(input?: string): Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(input ?? "")
    ? (input as Locale)
    : DEFAULT_LOCALE;
}

export default i18n;

// 类型增强：让 t("xxx") 拥有 key 补全与校验
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof zhCN };
  }
}
