// Generates the Portal's ES256 signing key for HR / Task sign-in handoff.
// Usage: node scripts/gen-signing-key.mjs   → paste the two lines into .env
// Rotating: publish the new key alongside the old one for a few minutes before switching.
import { generateKeyPairSync, randomBytes } from "node:crypto";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const der = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const kid = `portal-${new Date().toISOString().slice(0, 10)}-${randomBytes(3).toString("hex")}`;

console.log(`PORTAL_SIGNING_KID="${kid}"`);
console.log(`PORTAL_SIGNING_KEY="${der}"`);
