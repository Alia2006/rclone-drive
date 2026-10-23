import { createI18n } from "vue-i18n";
import zhCN from "../locales/zh-CN/index.js";
import zhTW from "../locales/zh-TW/index.js";
import en from "../locales/en/index.js";

export const LANGUAGES = [
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "en", label: "English" },
];

export const SUPPORTED_LOCALES = LANGUAGES.map((lang) => lang.code);

export function normalizeLocale(value) {
  if (!value || typeof value !== "string") return null;
  const normalized = value.replace(/_/g, "-");
  if (/^zh-(tw|hk|mo|hant)/i.test(normalized)) return "zh-TW";
  if (/^zh/i.test(normalized)) return "zh-CN";
  if (/^en/i.test(normalized)) return "en";
  return null;
}

export function detectSystemLocale() {
  const candidates = [];
  if (typeof navigator !== "undefined") {
    if (Array.isArray(navigator.languages)) candidates.push(...navigator.languages);
    if (navigator.language) candidates.push(navigator.language);
  }
  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate);
    if (locale) return locale;
  }
  return "zh-CN";
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: "zh-CN",
  fallbackLocale: "zh-CN",
  messages: {
    "zh-CN": zhCN,
    "zh-TW": zhTW,
    en,
  },
});

export function setLocale(value) {
  const locale = normalizeLocale(value) || "zh-CN";
  i18n.global.locale.value = locale;
  applyDocumentLocale(locale);
  return locale;
}

export function applyDocumentLocale(value) {
  const locale = normalizeLocale(value) || "zh-CN";
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
    document.title = i18n.global.t("app.title");
  }
}

const BACKEND_PREFIX = "@i18n@";

// Backend messages are either plain text or "@i18n@" + JSON { key, params }.
export function translateBackend(value) {
  if (value == null) return "";
  if (typeof value !== "string") {
    const nested = value?.message ?? value?.key ?? value;
    return typeof nested === "string" ? nested : String(nested);
  }
  if (!value.startsWith(BACKEND_PREFIX)) return value;
  try {
    const payload = JSON.parse(value.slice(BACKEND_PREFIX.length));
    if (!payload || typeof payload.key !== "string") return value;
    return i18n.global.te(payload.key)
      ? i18n.global.t(payload.key, payload.params || {})
      : payload.key;
  } catch {
    return value;
  }
}
