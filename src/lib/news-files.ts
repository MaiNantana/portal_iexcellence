// Files attached to a news post. The stored type comes from this allow-list by extension, never from
// the browser, and only images are ever shown inline (see app/[slug]/news-file/[id]/route.ts).

import { defineText, type Locale } from "@/i18n";

export const MAX_NEWS_FILES = 5;
export const MAX_NEWS_FILE_MB = 5;
const MAX_BYTES = MAX_NEWS_FILE_MB * 1024 * 1024;

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export const NEWS_FILE_ACCEPT = Object.keys(TYPES).map((e) => `.${e}`).join(",");

export function isInlineImage(mime: string) {
  return mime.startsWith("image/");
}

export function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const UPLOAD_TEXT = defineText({
  th: {
    tooMany: (max: number) => `แนบไฟล์ได้ไม่เกิน ${max} ไฟล์ต่อประกาศ`,
    tooBig: (name: string, mb: number) => `ไฟล์ ${name} ใหญ่เกิน ${mb} MB`,
    badType: (name: string) => `ไม่รองรับไฟล์ ${name} · ใช้ได้เฉพาะ PDF, Word, Excel, PowerPoint, TXT, CSV และรูปภาพ`,
  },
  en: {
    tooMany: (max: number) => `You can attach up to ${max} files per post.`,
    tooBig: (name: string, mb: number) => `${name} is larger than ${mb} MB.`,
    badType: (name: string) => `${name} is not supported · only PDF, Word, Excel, PowerPoint, TXT, CSV and images.`,
  },
});

export type NewsUpload = { name: string; mime: string; size: number; data: Uint8Array<ArrayBuffer> };

/** The form's "files" input, validated; `keeping` is how many attachments the post keeps. */
export async function readNewsUploads(form: FormData, keeping: number, locale: Locale): Promise<{ files: NewsUpload[] } | { error: string }> {
  const picked = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const t = UPLOAD_TEXT[locale];
  if (keeping + picked.length > MAX_NEWS_FILES) return { error: t.tooMany(MAX_NEWS_FILES) };
  const files: NewsUpload[] = [];
  for (const file of picked) {
    if (file.size > MAX_BYTES) return { error: t.tooBig(file.name, MAX_NEWS_FILE_MB) };
    const mime = TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""];
    if (!mime) return { error: t.badType(file.name) };
    const name = file.name.replace(/[\\/\x00-\x1f]/g, "_").slice(-150);
    files.push({ name, mime, size: file.size, data: new Uint8Array(await file.arrayBuffer()) });
  }
  return { files };
}
