import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/AuthScreen";
import { Onboarding } from "@/components/Onboarding";
import { currentUser, homePathFor, safeNext } from "@/lib/context";

/**
 * The only app page at the root. Signed out: global sign-in (for people who don't know their
 * company link). Signed in: their last company, or onboarding (create / join a company).
 * `?start=1` shows onboarding even to members, for creating or joining another company.
 */
export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; mode?: string; error?: string; start?: string }>;
}) {
  const { next: rawNext, mode, error, start } = await searchParams;
  const next = safeNext(rawNext);
  const user = await currentUser();

  if (!user || error) {
    return <AuthScreen mode={mode === "password" ? "password" : "signin"} next={next} loginBase="/" error={error} />;
  }
  if (next !== "/") redirect(next);
  const home = await homePathFor(user.id, user.email, user.lastOrgId);
  if (home && !start) redirect(home);
  return <Onboarding user={user} hasCompany={!!home} />;
}
