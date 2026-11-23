"use client";

import { useState, useTransition } from "react";
import { connectHr, listHrDatabases } from "@/app/hr-actions";
import { ActionForm } from "@/components/ActionForm";
import type { HrDatabase } from "@/lib/hr";
import { defineText } from "@/i18n";
import { useLocale } from "@/i18n/client";

const TEXT = defineText({
  th: {
    submit: "ทดสอบ Login และเชื่อมต่อ",
    url: "URL ของ HR",
    loading: "กำลังโหลดฐานข้อมูล HR...",
    unreachable: "ติดต่อระบบ HR จาก URL นี้ไม่ได้ ตรวจสอบ URL อีกครั้ง",
    noDatabases: "ไม่พบฐานข้อมูล HR ของบริษัทนี้ ตรวจสอบ URL อีกครั้ง",
    database: "ฐานข้อมูล",
    pickDatabase: "เลือกฐานข้อมูล",
    hrUser: "ชื่อผู้ใช้ HR ของคุณ",
    hrPassword: "รหัสผ่าน HR",
    note: "Portal จะลอง Login เข้า HR ก่อน ถ้าผ่านจึงเชื่อมต่อ และผูกบัญชี HR นี้กับคุณ · ไม่เก็บรหัสผ่าน",
  },
  en: {
    submit: "Test sign-in and connect",
    url: "HR URL",
    loading: "Loading HR databases...",
    unreachable: "Can't reach HR at this URL. Please check it.",
    noDatabases: "No HR database found for this company. Please check the URL.",
    database: "Database",
    pickDatabase: "Choose a database",
    hrUser: "Your HR username",
    hrPassword: "HR password",
    note: "The Portal signs in to HR first and connects only if that works, then links this HR account to you · the password is not stored",
  },
});

/** Admin's HR connect form: the database list follows the HR URL, and connecting means signing in to HR. */
export function HrConnectForm({ slug, defaultUrl, initialDatabases }: { slug: string; defaultUrl: string; initialDatabases: HrDatabase[] | null }) {
  const t = TEXT[useLocale()];
  const [databases, setDatabases] = useState(initialDatabases);
  const [loadedUrl, setLoadedUrl] = useState(defaultUrl);
  const [loading, startLoading] = useTransition();

  function reload(url: string) {
    if (url === loadedUrl) return;
    setLoadedUrl(url);
    startLoading(async () => setDatabases(await listHrDatabases(slug, url)));
  }

  return (
    <ActionForm org={slug} action={connectHr} submitLabel={t.submit} resetOnSuccess={false}>
      <div className="field">
        <label htmlFor="hrBaseUrl">{t.url}</label>
        <input id="hrBaseUrl" name="hrBaseUrl" type="url" required defaultValue={defaultUrl} onBlur={(e) => reload(e.target.value.trim())} />
      </div>
      {loading ? (
        <p className="quiet">{t.loading}</p>
      ) : databases === null ? (
        <div className="notice error">{t.unreachable}</div>
      ) : databases.length === 0 ? (
        <div className="notice error">{t.noDatabases}</div>
      ) : (
        databases.length > 1 && (
          <div className="field">
            <label htmlFor="hrDb">{t.database}</label>
            <select id="hrDb" name="hrDb" required defaultValue="" key={loadedUrl}>
              <option value="" disabled>
                {t.pickDatabase}
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
        <label htmlFor="hrUser">{t.hrUser}</label>
        <input id="hrUser" name="hrUser" required autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="hrPassword">{t.hrPassword}</label>
        <input id="hrPassword" name="hrPassword" type="password" required autoComplete="off" />
      </div>
      <small className="quiet">{t.note}</small>
    </ActionForm>
  );
}
