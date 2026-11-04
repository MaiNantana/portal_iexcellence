import { publicJwks } from "@/lib/handoff";

/** Public key(s) HR / Task use to verify Portal sign-in tokens. */
export async function GET() {
  return Response.json(await publicJwks(), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
