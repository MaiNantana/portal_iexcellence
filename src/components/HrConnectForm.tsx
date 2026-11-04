"use client";

import { useState, useTransition } from "react";
import { connectHr, listHrDatabases } from "@/app/hr-actions";
import { ActionForm } from "@/components/ActionForm";
import type { HrDatabase } from "@/lib/hr";

/** Admin's HR connect form: the database list follows the HR URL, and connecting means signing in to HR. */
export function HrConnectForm({ slug, defaultUrl, initialDatabases }: { slug: string; defaultUrl: string; initialDatabases: HrDatabase[] | null }) {
  const [databases, setDatabases] = useState(initialDatabases);
  const [loadedUrl, setLoadedUrl] = useState(defaultUrl);
  const [loading, startLoading] = useTransition();

  function reload(url: string) {
    if (url === loadedUrl) return;
    setLoadedUrl(url);
    startLoading(async () => setDatabases(await listHrDatabases(slug, url)));
  }

  return (
    <ActionForm org={slug} action={connectHr} submitLabel="ทดสอบ Login และเชื่อมต่อ" resetOnSuccess={false}>
      <div className="field">
        <label htmlFor="hrBaseUrl">URL ของ HR</label>
        <input id="hrBaseUrl" name="hrBaseUrl" type="url" required defaultValue={defaultUrl} onBlur={(e) => reload(e.target.value.trim())} />
      </div>
      {loading ? (
        <p className="quiet">กำลังโหลดฐานข้อมูล HR...</p>
      ) : databases === null ? (
        <div className="notice error">ติดต่อระบบ HR จาก URL นี้ไม่ได้ ตรวจสอบ URL อีกครั้ง</div>
      ) : databases.length === 0 ? (
        <div className="notice error">ไม่พบฐานข้อมูล HR ของบริษัทนี้ ตรวจสอบ URL อีกครั้ง</div>
      ) : (
        databases.length > 1 && (
          <div className="field">
            <label htmlFor="hrDb">ฐานข้อมูล</label>
            <select id="hrDb" name="hrDb" required defaultValue="" key={loadedUrl}>
              <option value="" disabled>
                เลือกฐานข้อมูล
              </option>
              {databases.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.caption}
                </option>
              ))}
            </select>
          </div>
        )
      )}
      <div className="field">
        <label htmlFor="hrUser">ชื่อผู้ใช้ HR ของคุณ</label>
        <input id="hrUser" name="hrUser" required autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="hrPassword">รหัสผ่าน HR</label>
        <input id="hrPassword" name="hrPassword" type="password" required autoComplete="off" />
      </div>
      <small className="quiet">Portal จะลอง Login เข้า HR ก่อน ถ้าผ่านจึงเชื่อมต่อ และผูกบัญชี HR นี้กับคุณ · ไม่เก็บรหัสผ่าน</small>
    </ActionForm>
  );
}
