import NextAuth, { CredentialsSignin } from "next-auth";
import type { Profile } from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { db } from "@/lib/db";
import { checkPassword, normalizeEmail, resolveOAuthUser } from "@/lib/identity";

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
    credentials: { email: {}, password: {} },
    async authorize(raw) {
      const email = normalizeEmail(raw?.email);
      const password = String(raw?.password ?? "");
      if (!email || !password) throw new PasswordSignInError("invalid");
      const result = await checkPassword(email, password);
      if ("error" in result) throw new PasswordSignInError(result.error);
      return { id: result.userId, email };
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/", error: "/" },
  callbacks: {
    async signIn({ account, profile }) {
      if (!account || account.type === "credentials") return true; // checked in authorize()
      const email = verifiedEmail(account.provider, profile);
      if (!email) return "/?error=unverified";
      await resolveOAuthUser({ provider: account.provider, subject: account.providerAccountId, email, name: profile?.name });
      return true;
    },
    async jwt({ token, user, account }) {
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
      session.user.id = token.uid as string;
      return session;
    },
  },
});
