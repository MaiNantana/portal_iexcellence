import NextAuth, { CredentialsSignin } from "next-auth";
import type { Profile } from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { checkPassword, normalizeEmail, resolveOAuthUser } from "@/lib/identity";
import { BROWSER_COOKIE, REMEMBER_COOKIE, SESSION_MAX_AGE, SHORT_SESSION_MS } from "@/lib/remember";
import { isSuperadmin } from "@/lib/superadmin";

class PasswordSignInError extends CredentialsSignin {
  constructor(code: string) {
    super();
    this.code = code;
  }
}

export const googleEnabled = !!process.env.AUTH_GOOGLE_ID;
export const microsoftEnabled = !!process.env.AUTH_MICROSOFT_ENTRA_ID_ID;

const providers: Provider[] = [
  Credentials({
    credentials: { email: {}, password: {}, remember: {} },
    async authorize(raw) {
      const email = normalizeEmail(raw?.email);
      const password = String(raw?.password ?? "");
      if (!email || !password) throw new PasswordSignInError("invalid");
      const result = await checkPassword(email, password);
      if ("error" in result) throw new PasswordSignInError(result.error);
      return { id: result.userId, email, remember: raw?.remember !== "0" };
    },
  }),
];
if (googleEnabled) providers.push(Google);
if (microsoftEnabled) {
  // Skip the default Graph photo fetch: it would put a base64 image into the session cookie.
  providers.push(MicrosoftEntraID({ profile: (p) => ({ id: p.sub, name: p.name, email: p.email }) }));
}

/**
 * The email we may trust from a provider, or null.
 * Microsoft only vouches for an email when the optional `xms_edov` claim is true
 * (enable it in the app registration); otherwise anyone could claim any address.
 */
function verifiedEmail(provider: string, profile: Profile | undefined) {
  const p = (profile ?? {}) as Profile & { email_verified?: boolean; xms_edov?: boolean };
  const trusted = provider === "google" ? p.email_verified === true : provider === "microsoft-entra-id" ? p.xms_edov === true : false;
  return trusted ? normalizeEmail(p.email) : null;
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  providers,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  pages: { signIn: "/", error: "/" },
  callbacks: {
    async signIn({ account, profile }) {
      if (!account || account.type === "credentials") return true; // checked in authorize()
      const email = verifiedEmail(account.provider, profile);
      if (!email) return "/?error=unverified";
      await resolveOAuthUser({ provider: account.provider, subject: account.providerAccountId, email, name: profile?.name });
      return true;
    },
    async jwt({ token, user, account, trigger, session }) {
      // Superadmin "act as" (สวมรอย): only set through startActingAs / stopActingAs, and re-checked
      // here against the real signed-in user, so the client can never grant it to itself.
      if (trigger === "update") {
        const actAs = (session as { actAs?: unknown } | undefined)?.actAs;
        if (actAs === null) delete token.actAs;
        else if (typeof actAs === "string" && typeof token.uid === "string") {
          const real = await db.user.findUnique({ where: { id: token.uid }, select: { email: true } });
          const target = await db.user.findUnique({ where: { id: actAs }, select: { id: true } });
          if (real && isSuperadmin(real.email) && target && target.id !== token.uid) token.actAs = target.id;
        }
        return token;
      }
      if (account) {
        // Sign-in: an unremembered session gets a hard end, and dies with the browser (see below).
        const jar = await cookies();
        const remember = account.type === "credentials" ? user.remember !== false : jar.get(REMEMBER_COOKIE)?.value !== "0";
        if (remember) delete token.until;
        else token.until = Date.now() + SHORT_SESSION_MS;
      } else if (typeof token.until === "number") {
        let browserOpen = true;
        try {
          browserOpen = (await cookies()).has(BROWSER_COOKIE);
        } catch {
          // no request scope: only the time limit applies
        }
        if (!browserOpen || Date.now() > token.until) return null;
      }
      if (account?.type === "credentials") {
        token.uid = user.id;
      } else if (account) {
        const identity = await db.identity.findUnique({
          where: { provider_subject: { provider: account.provider, subject: account.providerAccountId } },
        });
        token.uid = identity?.userId;
      }
      return token;
    },
    async session({ session, token }) {
      // While acting as someone, every page and action sees that user; realUserId keeps who is behind it.
      if (typeof token.actAs === "string") {
        session.user.id = token.actAs;
        session.realUserId = token.uid as string;
      } else {
        session.user.id = token.uid as string;
      }
      return session;
    },
  },
});
