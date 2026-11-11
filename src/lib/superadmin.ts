import { normalizeEmail } from "@/lib/identity";

// Platform operators: they see every company on /superadmin and can act as any company's admin
// ("สวมรอย"). SUPERADMIN_EMAILS (comma separated) overrides the default on the server.
const SUPERADMIN_EMAILS = new Set(
  (process.env.SUPERADMIN_EMAILS || "iammai.nan.mai@gmail.com")
    .split(",")
    .map((e) => normalizeEmail(e))
    .filter(Boolean),
);

export function isSuperadmin(email: string | null | undefined) {
  const e = normalizeEmail(email);
  return !!e && SUPERADMIN_EMAILS.has(e);
}
