"use client";

import { useRef, useState, useTransition } from "react";
import { inviteMember } from "@/app/actions";
import { listHrInvitees, type HrInvitee } from "@/app/hr-actions";
import { ActionForm } from "@/components/ActionForm";
import { defineText } from "@/i18n";
import { useLocale } from "@/i18n/client";

const TEXT = defineText({
  th: {
    status: { member: "เป็นสมาชิกแล้ว", invited: "เชิญแล้ว" },
    send: "ส่งคำเชิญ",
    emails: "อีเมล",
    emailsPlaceholder: "name@company.com\nหลายคน: บรรทัดละคน หรือคั่นด้วยจุลภาค",
    pickFromHr: "เลือกจากรายชื่อพนักงานใน HR",
    search: "ค้นหาพนักงาน",
    searchPlaceholder: "ค้นหาชื่อ รหัส แผนก หรืออีเมล",
    unpickAll: "ไม่เลือกทั้งหมด",
    pickAll: (n: number) => `เลือกทั้งหมด (${n})`,
    loading: "กำลังโหลดรายชื่อจาก HR...",
    noMatch: "ไม่พบพนักงานที่ค้นหา",
    noEmployees: "ไม่มีพนักงานใน HR",
    noEmail: "ไม่มีอีเมลใน HR",
    close: "ปิด",
    addPicked: (n: number) => `เพิ่ม ${n} คนลงในรายการ`,
    role: "บทบาท",
    department: "แผนก",
    noDepartment: "ไม่ระบุ",
  },
  en: {
    status: { member: "Already a member", invited: "Invited" },
    send: "Send invitations",
    emails: "Emails",
    emailsPlaceholder: "name@company.com\nSeveral people: one per line, or separated by commas",
    pickFromHr: "Pick from the HR employee list",
    search: "Search employees",
    searchPlaceholder: "Search name, code, department or email",
    unpickAll: "Unselect all",
    pickAll: (n: number) => `Select all (${n})`,
    loading: "Loading employees from HR...",
    noMatch: "No employees match",
    noEmployees: "No employees in HR",
    noEmail: "No email in HR",
    close: "Close",
    addPicked: (n: number) => `Add ${n} to the list`,
    role: "Role",
    department: "Department",
    noDepartment: "None",
  },
});

/** Invite form: several emails at once, typed or picked from the company's HR employee list. */
export function InviteMembersForm({ slug, departments, hrEnabled }: { slug: string; departments: Record<string, string>; hrEnabled: boolean }) {
  const t = TEXT[useLocale()];
  const emailsRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState<HrInvitee[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, startLoading] = useTransition();

  // Loaded on every open, so people invited a moment ago already show as invited.
  function openPicker() {
    setOpen(true);
    setPicked(new Set());
    setQuery("");
    setError("");
    startLoading(async () => {
      const res = await listHrInvitees(slug);
      if ("error" in res) {
        setEmployees(null);
        setError(res.error);
      } else setEmployees(res.employees);
    });
  }

  // The HR database name is only shown (and searched) when the company has more than one.
  const multipleDbs = new Set((employees ?? []).map((e) => e.db)).size > 1;
  const q = query.trim().toLowerCase();
  const shown = (employees ?? []).filter(
    (e) => !q || [e.name, e.code, e.email, e.department, multipleDbs ? e.db : null].some((v) => v?.toLowerCase().includes(q)),
  );
  const selectable = shown.filter((e) => e.email && e.status !== "member").map((e) => e.email!);
  const allShownPicked = selectable.length > 0 && selectable.every((m) => picked.has(m));

  function toggle(email: string) {
    const next = new Set(picked);
    if (next.has(email)) next.delete(email);
    else next.add(email);
    setPicked(next);
  }

  function toggleAllShown() {
    const next = new Set(picked);
    for (const m of selectable) {
      if (allShownPicked) next.delete(m);
      else next.add(m);
    }
    setPicked(next);
  }

  function addPicked() {
    const box = emailsRef.current;
    if (!box) return;
    const current = box.value.split(/[\s,;]+/).filter(Boolean);
    const seen = new Set(current.map((m) => m.toLowerCase()));
    box.value = [...current, ...[...picked].filter((m) => !seen.has(m))].join("\n");
    setOpen(false);
  }

  return (
    <ActionForm org={slug} action={inviteMember} submitLabel={t.send}>
      <div className="field">
        <label htmlFor="inv-emails">{t.emails}</label>
        <textarea
          ref={emailsRef}
          id="inv-emails"
          name="emails"
          className="inv-emails"
          required
          placeholder={t.emailsPlaceholder}
        />
        {hrEnabled && !open && (
          <div>
            <button type="button" className="btn tiny" onClick={openPicker}>
              {t.pickFromHr}
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="hrpick">
          <div className="hrpick-bar">
            <input
              type="search"
              aria-label={t.search}
              placeholder={t.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            />
            <button type="button" className="btn tiny" onClick={toggleAllShown} disabled={!selectable.length}>
              {allShownPicked ? t.unpickAll : t.pickAll(selectable.length)}
            </button>
          </div>

          {loading ? (
            <p className="quiet">{t.loading}</p>
          ) : error ? (
            <div className="notice error">{error}</div>
          ) : !shown.length ? (
            <p className="quiet">{employees?.length ? t.noMatch : t.noEmployees}</p>
          ) : (
            <div className="hrpick-list">
              {shown.map((e) => {
                const off = !e.email || e.status === "member";
                return (
                  <label key={`${e.db}:${e.code}:${e.email}`} className={`hrpick-row${off ? " off" : ""}`}>
                    <input type="checkbox" disabled={off} checked={!!e.email && picked.has(e.email)} onChange={() => e.email && toggle(e.email)} />
                    <span className="who">
                      <b>{e.name || "-"}</b>
                      <small>
                        {[e.code, e.department, multipleDbs ? e.db : ""].filter(Boolean).join(" · ")}
                        {" · "}
                        {e.email ?? t.noEmail}
                      </small>
                    </span>
                    {e.status && <span className={`chip ${e.status === "member" ? "gray" : "warn"}`}>{t.status[e.status]}</span>}
                  </label>
                );
              })}
            </div>
          )}

          <div className="hrpick-foot">
            <button type="button" className="btn tiny" onClick={() => setOpen(false)}>
              {t.close}
            </button>
            <button type="button" className="btn tiny primary" onClick={addPicked} disabled={!picked.size}>
              {t.addPicked(picked.size)}
            </button>
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="inv-role">{t.role}</label>
        <select id="inv-role" name="role" defaultValue="EMPLOYEE">
          <option value="EMPLOYEE">Employee</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="inv-dept">{t.department}</label>
        <select id="inv-dept" name="department" defaultValue="">
          <option value="">{t.noDepartment}</option>
          {Object.entries(departments).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
    </ActionForm>
  );
}
