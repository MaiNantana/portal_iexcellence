import { cookies } from "next/headers";
import { auth } from "@/auth";
import { orgPath, seeOther } from "@/lib/context";
import { linkDiscordAccount } from "@/lib/discord";

/** Discord OAuth redirect: links the Discord account to the signed-in Portal user. */
export async function GET(req: Request) {
  const q = new URL(req.url, "http://x").searchParams;
  const jar = await cookies();
  const saved = (() => {
    try {
      return JSON.parse(jar.get("discord_oauth")?.value ?? "") as { state: string; slug: string; userId: string };
    } catch {
      return null;
    }
  })();
  jar.delete({ name: "discord_oauth", path: "/api/discord" });
  if (!saved) return seeOther("/");
  const back = orgPath(saved.slug, "/notifications");

  const session = await auth();
  const code = q.get("code");
  if (!session?.user?.id || session.user.id !== saved.userId || q.get("state") !== saved.state || !code) {
    return seeOther(`${back}?discord=${q.get("error") === "access_denied" ? "cancelled" : "error"}`);
  }
  try {
    await linkDiscordAccount(saved.userId, code);
    return seeOther(`${back}?discord=ok`);
  } catch (err) {
    console.error("[discord] link failed:", err);
    return seeOther(`${back}?discord=error`);
  }
}
