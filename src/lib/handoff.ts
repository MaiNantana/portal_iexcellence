import { createPrivateKey, createPublicKey, randomUUID, type KeyObject } from "node:crypto";
import { exportJWK, SignJWT } from "jose";
import type { Member } from "@/lib/context";

// Sign-in handoff to HR / Task: a short-lived, single-use JWT signed by the Portal (ES256).
// Target systems verify it with the public key published at /api/portal/jwks.json.

const ALG = "ES256";
const TTL_SECONDS = 60;

export type HandoffAudience = "taskexcellence" | "hrexcellence";

let cached: { kid: string; privateKey: KeyObject; publicKey: KeyObject } | null = null;

function signingKey() {
  if (cached) return cached;
  const der = process.env.PORTAL_SIGNING_KEY;
  const kid = process.env.PORTAL_SIGNING_KID;
  if (!der || !kid) throw new Error("PORTAL_SIGNING_KEY / PORTAL_SIGNING_KID are not set (run: node scripts/gen-signing-key.mjs)");
  const privateKey = createPrivateKey({ key: Buffer.from(der, "base64"), format: "der", type: "pkcs8" });
  cached = { kid, privateKey, publicKey: createPublicKey(privateKey) };
  return cached;
}

export function portalIssuer() {
  return process.env.AUTH_URL ?? "http://localhost:3000";
}

export async function publicJwks() {
  const { kid, publicKey } = signingKey();
  return { keys: [{ ...(await exportJWK(publicKey)), kid, alg: ALG, use: "sig" }] };
}

/** Identity of `member` for one sign-in at `audience`, valid for 60 seconds. */
export async function signHandoff(member: Member, audience: HandoffAudience) {
  const { kid, privateKey } = signingKey();
  return new SignJWT({
    email: member.user.email,
    email_verified: true,
    name: member.user.name ?? undefined,
    org: { id: member.org.id, slug: member.org.slug, name: member.org.name },
    role: member.role === "ADMIN" ? "admin" : "member",
  })
    .setProtectedHeader({ alg: ALG, kid, typ: "JWT" })
    .setIssuer(portalIssuer())
    .setAudience(audience)
    .setSubject(member.userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(privateKey);
}
