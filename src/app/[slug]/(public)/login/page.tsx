import { notFound, redirect } from "next/navigation";
import { AuthScreen } from "@/components/AuthScreen";
import { currentUser, orgPath, safeNext } from "@/lib/context";
import { db } from "@/lib/db";

/** A company's own sign-in page (/abc/login): shows the company and returns to it afterwards. */
export default async function OrgLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { next: rawNext, error } = await searchParams;
  const org = await db.org.findUnique({ where: { slug }, select: { name: true } });
  if (!org) notFound();
  const next = rawNext ? safeNext(rawNext) : orgPath(slug);
  if ((await currentUser()) && !error) redirect(next);
  return <AuthScreen mode="signin" next={next} loginBase={orgPath(slug, "/login")} orgName={org.name} error={error} />;
}
