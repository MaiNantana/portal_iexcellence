// Multi-language UI (Thai + English). The language is the first segment of every page URL:
// /th/abc/admin, /en/abc/admin. middleware.ts strips it, passes it on in the x-locale header and
// remembers it in the "lang" cookie, so a link or redirect that still lacks the segment lands in the
// language the person last used. Server code reads it with getLocale() (i18n/server.ts), client code
// with useLocale() (i18n/client.tsx).
//
// Text lives next to the code that shows it: `const TEXT = defineText({ th: {...}, en: {...} })`, then
// `TEXT[locale].key`. Thai is the source; `en` must have exactly the same keys (TypeScript checks).
// Text people type themselves (news, service names, departments) is shown as typed, not translated.

export const LOCALES = ["th", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "th";
export const LOCALE_COOKIE = "lang";
export const LOCALE_HEADER = "x-locale";
export const LOCALE_NAMES: Record<Locale, string> = { th: "ไทย", en: "English" };

export function isLocale(v: unknown): v is Locale {
  return v === "th" || v === "en";
}

/** Text for both languages; `en` must mirror `th`'s keys. */
export function defineText<T>(text: { th: T; en: NoInfer<T> }) {
  return text;
}

/** "/abc/admin" → "/en/abc/admin"; "/" → "/en". A path that already starts with a language is re-pointed. */
export function withLocale(locale: Locale, path: string) {
  const { path: bare } = stripLocale(path);
  return bare === "/" ? `/${locale}` : bare.startsWith("/?") || bare.startsWith("/#") ? `/${locale}${bare.slice(1)}` : `/${locale}${bare}`;
}

/** "/en/abc/admin" → { locale: "en", path: "/abc/admin" }; a path with no language segment comes back as is. */
export function stripLocale(path: string): { locale: Locale | null; path: string } {
  const m = /^\/(th|en)(?=$|[/?#])/.exec(path);
  if (!m) return { locale: null, path };
  const rest = path.slice(m[0].length);
  return { locale: m[1] as Locale, path: rest.startsWith("/") ? rest : `/${rest}` };
}

const ZONE = "Asia/Bangkok";

/** "6 พ.ย. 2569" / "6 Nov 2026" */
export function formatDate(d: Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: ZONE }).format(d);
}

/** "6 พ.ย. 2569 14:30 น." / "6 Nov 2026, 14:30" */
export function formatDateTime(d: Date, locale: Locale) {
  const text = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: ZONE,
  }).format(d);
  return locale === "th" ? `${text} น.` : text;
}
