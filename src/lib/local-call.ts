import { lookup } from "node:dns/promises";
import { networkInterfaces } from "node:os";
import { portalIssuer } from "@/lib/handoff";

// HR / Task → Portal calls (/api/notify, /api/notify/status) need no key: like the Notification Hub's /v1,
// they are only accepted from this server, where Portal, Task and the Hub run together.

const norm = (ip: string) => ip.trim().replace(/^::ffff:/, "").toLowerCase();

/** This machine's addresses: loopback, its network interfaces, and the public IP its own host name points at. */
let ownIps: { at: number; ips: Set<string> } | null = null;
async function serverIps() {
  if (ownIps && Date.now() - ownIps.at < 10 * 60_000) return ownIps.ips;
  const ips = new Set(["127.0.0.1", "::1"]);
  for (const list of Object.values(networkInterfaces())) for (const a of list ?? []) ips.add(norm(a.address));
  try {
    for (const a of await lookup(new URL(portalIssuer()).hostname, { all: true })) ips.add(norm(a.address));
  } catch {
    // DNS down: loopback and interfaces still work.
  }
  ownIps = { at: Date.now(), ips };
  return ips;
}

/**
 * The caller's address. Under IIS, iisnode (enableXFF) appends the real client address as the last
 * X-Forwarded-For entry, so earlier entries a client sends itself are ignored.
 */
function callerIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  return xff ? norm(xff.split(",").at(-1) ?? "") : "127.0.0.1"; // next dev: no proxy, local machine
}

/** null when the request comes from this server, else a 403 response to return. */
export async function fromThisServer(req: Request) {
  const ip = callerIp(req);
  if ((await serverIps()).has(ip)) return null;
  console.warn(`[notify] refused call from ${ip}`);
  return Response.json({ error: "forbidden", message: "only callable from the Portal server" }, { status: 403 });
}
