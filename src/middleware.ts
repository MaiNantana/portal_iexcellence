import { decode, encode } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_MAX_AGE } from "@/lib/remember";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, LOCALE_HEADER, stripLocale, type Locale } from "@/i18n";

// 1. Language: every page URL starts with /th or /en. That segment is stripped here and the page runs
//    at its usual path (/en/abc/admin → /abc/admin) with the language in the x-locale header. A URL
//    without it (an old link, a redirect from code) is sent to the language last used (cookie), else
//    the browser's, else Thai.
// 2. Sign-in: signed-out visitors of company pages go to that company's login (/en/abc/login),
//    keeping the full path they asked for. This only checks that a session cookie exists; real
//    authorization still happens server-side in requireUser / requireMember on every request.
// 3. Staying signed in: a remembered session is renewed on use (see renewSession), so it only
//    ends after SESSION_MAX_AGE without opening any page.
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];
const YEAR = 60 * 60 * 24 * 365;

/**
 * Behind IIS the request URL reads http(s)://localhost:3000, so the redirect is built from the Host
 * the browser sent (iisnode passes it on; server.js sets x-forwarded-proto). Middleware can't send a
 * relative Location: Next.js rejects it.
 */
function redirectTo(req: NextRequest, path: string) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || req.nextUrl.protocol.replace(":", "");
  return NextResponse.redirect(new URL(path, host ? `${proto}://${host}` : req.nextUrl.origin), 307);
}

function preferredLocale(req: NextRequest): Locale {
  const saved = req.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  const accept = req.headers.get("accept-language")?.toLowerCase() ?? "";
  const th = accept.indexOf("th"), en = accept.indexOf("en");
  return en >= 0 && (th < 0 || en < th) ? "en" : DEFAULT_LOCALE;
}

const RENEW_AFTER = 24 * 60 * 60; // seconds: re-issue the cookie at most once a day

/**
 * Sliding session: Auth.js only re-issues its cookie through /api/auth/session, which this app
 * doesn't call, so a remembered session would end 30 days after sign-in however often it's used.
 * Here a valid one is re-signed with a fresh 30 days. Unremembered sessions (token.until) are left
 * alone: they end with the browser or after 8 hours anyway. Any failure just skips renewal.
 */
async function renewSession(req: NextRequest, res: NextResponse) {
  const secret = process.env.AUTH_SECRET;
  const name = SESSION_COOKIES.find((n) => req.cookies.has(n));
  if (!secret || !name) return; // none, or a chunked cookie (name.0): too big to be ours
  try {
    const token = await decode({ token: req.cookies.get(name)!.value, secret, salt: name });
    const now = Math.floor(Date.now() / 1000);
    if (!token || typeof token.exp !== "number" || token.until !== undefined) return;
    if (token.exp - now > SESSION_MAX_AGE - RENEW_AFTER) return; // renewed recently
    const claims = { ...token };
    delete claims.exp;
    delete claims.iat;
    delete claims.jti;
    const value = await encode({ token: claims, secret, salt: name, maxAge: SESSION_MAX_AGE });
    res.cookies.set(name, value, { path: "/", httpOnly: true, sameSite: "lax", secure: name.startsWith("__Secure-"), maxAge: SESSION_MAX_AGE });
  } catch {
    // unreadable token (old secret etc.): the page's own auth() decides
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const { locale, path } = stripLocale(pathname);

  if (!locale) return redirectTo(req, `/${preferredLocale(req)}${pathname === "/" ? "" : pathname}${search}`);

  const [, slug, section] = path.split("/");
  // "/" renders its own sign-in; a company's login pages must stay reachable.
  if (slug && section !== "login" && !SESSION_COOKIES.some((name) => req.cookies.has(name))) {
    // /superadmin is not a company: sign in on the root page.
    const login = slug === "superadmin" ? `/${locale}` : `/${locale}/${slug}/login`;
    return redirectTo(req, `${login}?next=${encodeURIComponent(pathname + search)}`);
  }

  const headers = new Headers(req.headers);
  headers.set(LOCALE_HEADER, locale);
  const url = req.nextUrl.clone();
  url.pathname = path;
  const res = NextResponse.rewrite(url, { request: { headers } });
  if (req.cookies.get(LOCALE_COOKIE)?.value !== locale) res.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: YEAR, sameSite: "lax" });
  await renewSession(req, res);
  return res;
}

// /api, Next assets and static files (anything with a file extension) are public and have no language.
export const config = { matcher: ["/((?!api/|_next/|.*\\.[a-zA-Z0-9]+$).*)"] };
