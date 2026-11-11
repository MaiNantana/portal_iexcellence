import { NextResponse, type NextRequest } from "next/server";

// Sends signed-out visitors of company pages to that company's login (/abc/login) while keeping
// the full path they asked for. This only checks that a session cookie exists; real authorization
// still happens server-side in requireUser / requireMember on every request.
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const [, slug, section] = pathname.split("/");
  // "/" renders its own sign-in; a company's login pages must stay reachable.
  if (!slug || section === "login" || SESSION_COOKIES.some((name) => req.cookies.has(name))) return NextResponse.next();
  const url = req.nextUrl.clone();
  // /superadmin is not a company: sign in on the root page.
  url.pathname = slug === "superadmin" ? "/" : `/${slug}/login`;
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

// /api, Next assets and the site icons are public.
export const config = { matcher: ["/((?!api/|_next/|favicon\\.ico|icon\\.svg).*)"] };
