"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LANG, LANG_COOKIE, translate, type Lang, type Translate } from "./translate";

type I18n = { lang: Lang; setLang: (lang: Lang) => void; t: Translate };

const I18nContext = createContext<I18n>({
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (key, ...args) => translate(DEFAULT_LANG, key, ...args),
});

export function I18nProvider({ initialLang, children }: { initialLang: Lang; children: ReactNode }) {
  const router = useRouter();
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((next: Lang) => {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    setLangState(next);
    router.refresh();
  }, [router]);

  const value = useMemo<I18n>(() => ({
    lang,
    setLang,
    t: (key, ...args) => translate(lang, key, ...args),
  }), [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useT = () => useContext(I18nContext).t;
export const useLang = () => useContext(I18nContext);
