"use client";

import { ClipboardCheck, House, LayoutGrid, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { defineText, stripLocale } from "@/i18n";
import { useLocale } from "@/i18n/client";

const TEXT = defineText({
  th: { home: "หน้าแรก", work: "งานของฉัน", services: "บริการ", shortcuts: "ทางลัด", main: "เมนูหลัก", quick: "ทางเข้าอย่างรวดเร็ว" },
  en: { home: "Home", work: "My work", services: "Services", shortcuts: "Shortcuts", main: "Main menu", quick: "Quick access" },
});

const ITEMS = [
  { path: "", key: "home", Icon: House },
  { path: "/my-work", key: "work", Icon: ClipboardCheck },
  { path: "#services", key: "services", Icon: LayoutGrid },
  { path: "/launcher", key: "shortcuts", Icon: Zap },
] as const;

/** `base` is the tenant root in the current language, e.g. "/th/abc". */
export function TopNav({ base }: { base: string }) {
  const t = TEXT[useLocale()];
  // Compared without the language segment: it doesn't matter which form the router reports.
  const path = stripLocale(usePathname()).path;
  return (
    <nav className="topnav" aria-label={t.main}>
      {ITEMS.map((i) => (
        <Link key={i.path} href={base + i.path} className={path === stripLocale(base + i.path).path ? "sel" : ""}>
          <i.Icon size={16} strokeWidth={1.75} aria-hidden="true" />
          {t[i.key]}
        </Link>
      ))}
    </nav>
  );
}

export function MobileDock({ base }: { base: string }) {
  const t = TEXT[useLocale()];
  return (
    <nav className="mobile-dock" aria-label={t.quick}>
      {ITEMS.map((i) => (
        <Link key={i.path} href={base + i.path}>
          <i.Icon size={21} strokeWidth={1.75} aria-hidden="true" />
          {t[i.key]}
        </Link>
      ))}
    </nav>
  );
}
