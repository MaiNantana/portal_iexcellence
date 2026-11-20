import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { loginPath, orgPath, seeOther } from "@/lib/context";
import { discordAuthorizeUrl, discordConfigured } from "@/lib/discord";

/** Starts "Connect Discord": /api/discord/connect?org=<slug> → Discord sign-in → /api/discord/callback. */
export async function GET(req: Request) {
  const slug = (new URL(req.url, "http://x").searchParams.get("org") ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  const back = orgPath(slug, "/notifications");
  const session = await auth();
  if (!session?.user?.id) return seeOther(loginPath(back));
  if (!discordConfigured()) return seeOther(`${back}?discord=off`);
  // A superadmin acting as someone must not bind their own Discord to that person.
  if (session.realUserId) return seeOther(`${back}?discord=acting`);

  const state = randomBytes(24).toString("base64url");
  (await cookies()).set("discord_oauth", JSON.stringify({ state, slug, userId: session.user.id }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/discord",
    maxAge: 600,
  });
  return new Response(null, { status: 303, headers: { Location: discordAuthorizeUrl(state) } });
}
