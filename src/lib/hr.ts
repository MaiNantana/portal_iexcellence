// HR Excellence: one web app per customer at <HR host>/<customer>/ (e.g. https://hrtest.iexcellence.net/ixcl/), sharing one API.
// Employees link their HR username once (checked by HR's own login API); the Portal keeps only the
// resulting HR token "user|db|port|server" in AccountLink.externalUserId, never the password.
// One HR URL can hold several databases, so a member has one AccountLink per database (externalDb).

/** Where the admin's HR connect form starts (the company path is added after it). */
export const HR_DEFAULT_ORIGIN = process.env.HR_DEFAULT_ORIGIN || "https://hrtest.iexcellence.net";
export const HR_API_URL = process.env.HR_API_URL || "https://hr.iexcellence.net/hr_api/api/";

/** "ixcl" from https://hrtest.iexcellence.net/ixcl/ */
export function hrCustomer(hrBaseUrl: string) {
  return new URL(hrBaseUrl).pathname.split("/").filter(Boolean)[0] ?? "";
}

export function hrAppUrl(hrBaseUrl: string, path: string) {
  const u = new URL(hrBaseUrl);
  return new URL(`/${hrCustomer(hrBaseUrl)}/${path}`, u.origin);
}

/** HR pages the Portal may open directly (HR's PortalLogin.ashx keeps the same allow-list). */
export const HR_TARGETS = new Set(["approve-leave", "approve-ot"]);

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

/** The linked HR token "user|db|port|server" split into its parts. */
export function hrTokenParts(token: string) {
  const [user, db, port, server] = token.split("|");
  return { user, db, port: port || "3307", server };
}

/** EMPLOYEE_ID of an HR login, or null when the login has no employee (e.g. an HR admin account). */
export async function hrEmployeeId(token: string): Promise<string | null> {
  const { user, db, port } = hrTokenParts(token);
  const res = await fetch(new URL("CfEmployeeGeneral/GetDataFromMobile", HR_API_URL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dbName: db, dbPort: port, userName: user }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const result = await hrJson(res);
  const id = result?.data?.EMPLOYEE_ID;
  return id === null || id === undefined ? null : String(id);
}

export type HrRequestType = "AS" | "OT";
export type HrApproval = {
  type: HrRequestType;
  /** HR database the request lives in (the approver may be linked to several). */
  db: string;
  requestId: string;
  employeeName: string;
  kind: string;
  startDate: string | null;
  endDate: string | null;
  requestedAt: string | null;
};

/** Leave (AS) and OT requests waiting for this approver right now, as HR's own approver list shows them. */
export async function hrPendingApprovals(token: string, employeeId: string): Promise<HrApproval[]> {
  const { db, port } = hrTokenParts(token);
  const lists = await Promise.all(
    (["AS", "OT"] as const).map(async (type) => {
      const url = new URL("ApproverRequest/GetHistory", HR_API_URL);
      url.search = new URLSearchParams({ dbName: db, dbPort: port, employeeId, type }).toString();
      const rows = await hrJson(await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) }));
      if (!Array.isArray(rows)) throw new Error(`HR GetHistory ${type}: ${String(rows).slice(0, 200)}`);
      return (rows as Record<string, unknown>[])
        .filter((r) => r.canapprove === true)
        .map((r) => ({
          type,
          db,
          requestId: String(r.requestid),
          employeeName: String(r.employeename ?? "").trim(),
          kind: String((type === "AS" ? r.absenttype : r.ottype) ?? (type === "AS" ? "ลางาน" : "OT")),
          startDate: (r.startdate as string) ?? null,
          endDate: (r.enddate as string) ?? null,
          requestedAt: (r.requestdatetime as string) ?? null,
        }));
    }),
  );
  return lists.flat();
}
