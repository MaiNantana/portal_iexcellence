// HR Excellence: one web app per customer at https://hr.iexcellence.net/<customer>/, sharing one API.
// Employees link their HR username once (checked by HR's own login API); the Portal keeps only the
// resulting HR token "user|db|port|server" in AccountLink.externalUserId, never the password.

export const HR_API_URL = process.env.HR_API_URL || "https://hr.iexcellence.net/hr_api/api/";

/** "ixcl" from https://hr.iexcellence.net/ixcl/ */
export function hrCustomer(hrBaseUrl: string) {
  return new URL(hrBaseUrl).pathname.split("/").filter(Boolean)[0] ?? "";
}

export function hrAppUrl(hrBaseUrl: string, path: string) {
  const u = new URL(hrBaseUrl);
  return new URL(`/${hrCustomer(hrBaseUrl)}/${path}`, u.origin);
}

export type HrDatabase = { name: string; caption: string; port: string; server: string };

/** HR's API answers with a JSON string inside JSON. */
async function hrJson(res: Response) {
  const body = await res.json();
  return typeof body === "string" ? JSON.parse(body) : body;
}

export async function hrDatabases(customer: string): Promise<HrDatabase[]> {
  const url = new URL("HrSystem/GetDbList", HR_API_URL);
  url.search = new URLSearchParams({ userName: "", dbPort: "3307", dbCustShortName: customer, dbName: "" }).toString();
  const rows = await hrJson(await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) }));
  return (rows as Record<string, string | null>[])
    .filter((r) => r.database_name && r.caption_name)
    .map((r) => ({ name: r.database_name!, caption: r.caption_name!, port: r.db_port ?? "3307", server: r.db_server ?? "" }));
}

/** Checks HR credentials with HR's own login API; returns the HR token, or null if they're wrong. */
export async function hrLogin(db: HrDatabase, user: string, passwd: string): Promise<string | null> {
  const res = await fetch(new URL("GbUserLogin/ValidLogin", HR_API_URL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ header: { dbName: db.name, dbPort: db.port, userName: user }, user, passwd, dbName: db.name, dbPort: db.port, dbServer: db.server }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const result = await hrJson(res);
  const token = typeof result?.token === "string" ? result.token : "";
  // Only real accounts in the customer's database (the built-in super user gets a 2-part token).
  return result?.result === true && token.split("|").length === 4 ? token : null;
}
