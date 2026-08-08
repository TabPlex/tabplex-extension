import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import { setFormattingLocale } from "~core/utils"

import enUS from "./locales/en-US.json"
import zhCN from "./locales/zh-CN.json"

const FALLBACK_LANGUAGE = "en-US"

const normalizeLanguage = (lang?: string) => {
  const normalized = (lang || "").toLowerCase()
  if (normalized.startsWith("zh")) return "zh-CN"
  if (normalized.startsWith("en")) return "en-US"
  return FALLBACK_LANGUAGE
}

const resolveDefaultLanguage = () => {
  if (typeof chrome !== "undefined") {
    const getUiLanguage = chrome.i18n?.getUILanguage
    if (typeof getUiLanguage === "function") {
      return normalizeLanguage(getUiLanguage())
    }
  }
  if (typeof navigator !== "undefined") {
    return normalizeLanguage(navigator.languages?.[0] || navigator.language)
  }
  return FALLBACK_LANGUAGE
}

const defaultLanguage = resolveDefaultLanguage()

const resources = {
  "zh-CN": {
    translation: zhCN
  },
  "en-US": {
    translation: enUS
  }
} as const

i18n.use(initReactI18next).init({
  resources,
  lng: defaultLanguage, // 默认语言，初始化后可能会根据设置更新
  fallbackLng: defaultLanguage,
  interpolation: {
    escapeValue: false // react already safes from xss
  }
})

setFormattingLocale(defaultLanguage)

const applyDocumentLanguage = (language: string) => {
  if (typeof document === "undefined") return
  document.documentElement.lang = normalizeLanguage(language)
}

applyDocumentLanguage(defaultLanguage)
i18n.on("languageChanged", (lng) => {
  setFormattingLocale(lng)
  applyDocumentLanguage(lng)
})
