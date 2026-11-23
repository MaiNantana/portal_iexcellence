import type { Metadata, Viewport } from "next";
import { LocaleProvider } from "@/i18n/client";
import { getLocale } from "@/i18n/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: "iExcellence Company Workspace",
    description: locale === "th" ? "ข่าวสาร บริการ และทางลัดของบริษัท รวมไว้ในที่เดียว" : "Company news, services and shortcuts in one place",
  };
}

export const viewport: Viewport = { themeColor: "#f26b1d" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- loaded at runtime so a build never depends on Google Fonts */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
