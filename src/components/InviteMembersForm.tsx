"use client";

import { useRef, useState, useTransition } from "react";
import { inviteMember } from "@/app/actions";
import { listHrInvitees, type HrInvitee } from "@/app/hr-actions";
import { ActionForm } from "@/components/ActionForm";

const STATUS_LABEL = { member: "เป็นสมาชิกแล้ว", invited: "เชิญแล้ว" } as const;

/** Invite form: several emails at once, typed or picked from the company's HR employee list. */
export function InviteMembersForm({ slug, departments, hrEnabled }: { slug: string; departments: Record<string, string>; hrEnabled: boolean }) {
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
    <ActionForm org={slug} action={inviteMember} submitLabel="ส่งคำเชิญ">
      <div className="field">
        <label htmlFor="inv-emails">อีเมล</label>
        <textarea
          ref={emailsRef}
          id="inv-emails"
          name="emails"
          className="inv-emails"
          required
          placeholder={"name@company.com\nหลายคน: บรรทัดละคน หรือคั่นด้วยจุลภาค"}
        />
        {hrEnabled && !open && (
          <div>
            <button type="button" className="btn tiny" onClick={openPicker}>
              เลือกจากรายชื่อพนักงานใน HR
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="hrpick">
          <div className="hrpick-bar">
            <input
              type="search"
              aria-label="ค้นหาพนักงาน"
              placeholder="ค้นหาชื่อ รหัส แผนก หรืออีเมล"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            />
            <button type="button" className="btn tiny" onClick={toggleAllShown} disabled={!selectable.length}>
              {allShownPicked ? "ไม่เลือกทั้งหมด" : `เลือกทั้งหมด (${selectable.length})`}
            </button>
          </div>

          {loading ? (
            <p className="quiet">กำลังโหลดรายชื่อจาก HR...</p>
          ) : error ? (
            <div className="notice error">{error}</div>
          ) : !shown.length ? (
            <p className="quiet">{employees?.length ? "ไม่พบพนักงานที่ค้นหา" : "ไม่มีพนักงานใน HR"}</p>
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
                        {e.email ?? "ไม่มีอีเมลใน HR"}
                      </small>
                    </span>
                    {e.status && <span className={`chip ${e.status === "member" ? "gray" : "warn"}`}>{STATUS_LABEL[e.status]}</span>}
                  </label>
                );
              })}
            </div>
          )}

          <div className="hrpick-foot">
            <button type="button" className="btn tiny" onClick={() => setOpen(false)}>
              ปิด
            </button>
            <button type="button" className="btn tiny primary" onClick={addPicked} disabled={!picked.size}>
              เพิ่ม {picked.size} คนลงในรายการ
            </button>
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="inv-role">บทบาท</label>
        <select id="inv-role" name="role" defaultValue="EMPLOYEE">
          <option value="EMPLOYEE">Employee</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="inv-dept">แผนก</label>
        <select id="inv-dept" name="department" defaultValue="">
          <option value="">ไม่ระบุ</option>
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
