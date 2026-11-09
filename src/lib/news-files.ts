// Files attached to a news post. The stored type comes from this allow-list by extension, never from
// the browser, and only images are ever shown inline (see app/[slug]/news-file/[id]/route.ts).

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

export type NewsUpload = { name: string; mime: string; size: number; data: Uint8Array<ArrayBuffer> };

/** The form's "files" input, validated; `keeping` is how many attachments the post keeps. */
export async function readNewsUploads(form: FormData, keeping: number): Promise<{ files: NewsUpload[] } | { error: string }> {
  const picked = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (keeping + picked.length > MAX_NEWS_FILES) return { error: `แนบไฟล์ได้ไม่เกิน ${MAX_NEWS_FILES} ไฟล์ต่อประกาศ` };
  const files: NewsUpload[] = [];
  for (const file of picked) {
    if (file.size > MAX_BYTES) return { error: `ไฟล์ ${file.name} ใหญ่เกิน ${MAX_NEWS_FILE_MB} MB` };
    const mime = TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""];
    if (!mime) return { error: `ไม่รองรับไฟล์ ${file.name} · ใช้ได้เฉพาะ PDF, Word, Excel, PowerPoint, TXT, CSV และรูปภาพ` };
    const name = file.name.replace(/[\\/\x00-\x1f]/g, "_").slice(-150);
    files.push({ name, mime, size: file.size, data: new Uint8Array(await file.arrayBuffer()) });
  }
  return { files };
}
