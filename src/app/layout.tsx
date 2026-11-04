import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "iExcellence Company Workspace",
  description: "ข่าวสาร บริการ และทางลัดของบริษัท รวมไว้ในที่เดียว",
};

export const viewport: Viewport = { themeColor: "#104f49" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
