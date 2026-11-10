import Link from "next/link";
import { logout } from "@/app/actions";
import { createOrg, goToJoinCode } from "@/app/org-actions";
import { ActionForm } from "@/components/ActionForm";
import { db } from "@/lib/db";
import type { User } from "@prisma/client";
import { Logo } from "@/components/Logo";

/** Shown at "/" to signed-in people without a company yet, or with ?start=1 to create / join another one. */
export async function Onboarding({ user, hasCompany }: { user: User; hasCompany: boolean }) {
  const requests = await db.joinRequest.findMany({ where: { userId: user.id }, include: { org: { select: { name: true } } } });

  return (
    <main className="login">
      <div className="card" style={{ maxWidth: 520, textAlign: "left" }}>
        <Logo className="logo logo-inline" />
        <h2>ยินดีต้อนรับ</h2>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 6px" }}>
          เข้าสู่ระบบเป็น <b>{user.email}</b>
          {!hasCompany && " · บัญชีนี้ยังไม่ได้อยู่ในบริษัทใด"}
        </p>
        {hasCompany && (
          <Link href="/" className="inline-link">‹ กลับไปที่ Workspace</Link>
        )}

        {requests.map((r) => (
          <div key={r.id} className="notice" style={{ marginTop: 12 }}>
            ส่งคำขอเข้าร่วม <b>{r.org.name}</b> แล้ว · รอ Admin อนุมัติ
          </div>
        ))}

        <div className="launcher-group">มีลิงก์หรือรหัสเข้าร่วมบริษัท</div>
        <ActionForm action={goToJoinCode} submitLabel="ไปต่อ" resetOnSuccess={false}>
          <div className="field" style={{ margin: 0 }}>
            <input name="code" required placeholder="วางลิงก์เข้าร่วม หรือรหัสที่ได้จาก Admin" aria-label="ลิงก์หรือรหัสเข้าร่วม" />
          </div>
        </ActionForm>

        <div className="launcher-group">สร้างบริษัทใหม่</div>
        <p className="low" style={{ marginTop: 0 }}>คุณจะเป็น Admin และเชิญพนักงานได้ด้วยอีเมล โดเมนอีเมลบริษัท หรือลิงก์เข้าร่วม</p>
        <ActionForm action={createOrg} submitLabel="สร้างบริษัท" resetOnSuccess={false}>
          <div className="field" style={{ margin: 0 }}>
            <input name="name" required minLength={2} maxLength={100} placeholder="ชื่อบริษัท" aria-label="ชื่อบริษัท" />
          </div>
          <div className="field">
            <label htmlFor="new-slug">รหัสบริษัท (ใช้ใน URL เช่น /abc)</label>
            <input id="new-slug" name="slug" required pattern="[a-z0-9][a-z0-9_\-]{1,28}[a-z0-9]" placeholder="abc" title="a-z, 0-9, - และ _ ได้ 3–30 ตัว" />
          </div>
        </ActionForm>

        <p className="notice" style={{ marginTop: 18 }}>
          ถ้าบริษัทของคุณยืนยันโดเมนอีเมลไว้แล้ว (เช่น @บริษัท.co.th) คุณจะเข้าได้อัตโนมัติเมื่อเข้าสู่ระบบด้วยอีเมลนั้น
        </p>
        <form action={logout.bind(null, null)} style={{ marginTop: 12 }}>
          <button className="inline-link">ออกจากระบบ / ใช้บัญชีอื่น</button>
        </form>
      </div>
    </main>
  );
}
