import { cache } from "react";
import { headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_HEADER, withLocale, type Locale } from "@/i18n";

/** The language of this request, from the URL's first segment (set by middleware.ts). */
export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await headers()).get(LOCALE_HEADER);
  return isLocale(value) ? value : DEFAULT_LOCALE;
});

/** A site path in this request's language: "/abc/admin" → "/en/abc/admin". */
export async function localePath(path: string) {
  return withLocale(await getLocale(), path);
}
