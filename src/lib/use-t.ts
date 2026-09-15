"use client";
import { useEffect } from "react";
import { useApp } from "./store";
import { translate, type Lang, LANGS } from "./i18n";

// Returns the current language + a translation function.
// Also keeps <html dir> and lang attribute in sync for RTL/LTR.
export function useT() {
  const lang = useApp((s) => s.lang);

  useEffect(() => {
    const dir = lang === "fa" ? "rtl" : "ltr";
    if (typeof document !== "undefined") {
      document.documentElement.dir = dir;
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const t = (key: string, fallback?: string) => translate(lang, key, fallback);
  const isFa = lang === "fa";
  return { t, lang, isFa, dir: lang === "fa" ? ("rtl" as const) : ("ltr" as const) };
}

export { LANGS, type Lang };
