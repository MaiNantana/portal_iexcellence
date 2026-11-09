"use client";

import { ClipboardCheck, House, LayoutGrid, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { path: "", label: "หน้าแรก", Icon: House },
  { path: "/my-work", label: "งานของฉัน", Icon: ClipboardCheck },
  { path: "#services", label: "บริการ", Icon: LayoutGrid },
  { path: "/launcher", label: "ทางลัด", Icon: Zap },
];

/** `base` is the tenant root, e.g. "/abc". */
export function TopNav({ base }: { base: string }) {
  const path = usePathname();
  return (
    <nav className="topnav" aria-label="เมนูหลัก">
      {ITEMS.map((i) => (
        <Link key={i.path} href={base + i.path} className={path === base + i.path ? "sel" : ""}>
          <i.Icon size={16} strokeWidth={1.75} aria-hidden="true" />
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function MobileDock({ base }: { base: string }) {
  return (
    <nav className="mobile-dock" aria-label="ทางเข้าอย่างรวดเร็ว">
      {ITEMS.map((i) => (
        <Link key={i.path} href={base + i.path}>
          <i.Icon size={21} strokeWidth={1.75} aria-hidden="true" />
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
