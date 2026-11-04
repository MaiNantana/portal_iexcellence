import { notFound } from "next/navigation";
import { AuthScreen } from "@/components/AuthScreen";
import { orgPath, safeNext } from "@/lib/context";
import { db } from "@/lib/db";

export default async function OrgPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { slug } = await params;
  const { next: rawNext } = await searchParams;
  const org = await db.org.findUnique({ where: { slug }, select: { name: true } });
  if (!org) notFound();
  const next = rawNext ? safeNext(rawNext) : orgPath(slug);
  return <AuthScreen mode="password" next={next} loginBase={orgPath(slug, "/login")} orgName={org.name} />;
}
