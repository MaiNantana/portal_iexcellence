"use client";

import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, LOCALE_NAMES, LOCALES, withLocale, type Locale } from "@/i18n";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Set once in the root layout from the request's language. */
export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

/** "ไทย | English": reopens the current page in the other language (same path, query and #anchor). */
export function LanguageSwitch({ className }: { className?: string }) {
  const locale = useLocale();
  const go = (to: Locale) => {
    const { pathname, search, hash } = window.location;
    window.location.assign(withLocale(to, pathname) + search + hash);
  };
  return (
    <div className={`langswitch ${className ?? ""}`} role="group" aria-label="Language / ภาษา">
      {LOCALES.map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={l === locale} className={l === locale ? "sel" : ""} onClick={() => l !== locale && go(l)}>
          {l === "th" ? "TH" : "EN"}
          <span className="sr-only"> {LOCALE_NAMES[l]}</span>
        </button>
      ))}
    </div>
  );
}
