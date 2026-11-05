"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { path: "", label: "หน้าแรก", icon: "⌂" },
  { path: "/my-work", label: "งานของฉัน", icon: "☑" },
  { path: "#services", label: "บริการ", icon: "▦" },
  { path: "/launcher", label: "⚡ ทางลัด", icon: "⚡" },
];

/** `base` is the tenant root, e.g. "/abc". */
export function TopNav({ base }: { base: string }) {
  const path = usePathname();
  return (
    <nav className="topnav" aria-label="เมนูหลัก">
      {ITEMS.map((i) => (
        <Link key={i.path} href={base + i.path} className={path === base + i.path ? "sel" : ""}>
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
          <span>{i.icon}</span>
          {i.label.replace("⚡ ", "")}
        </Link>
      ))}
    </nav>
  );
}
