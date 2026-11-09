const EVERY_MS = 60_000;

/** Runs once when the server starts: checks for news emails that are due (including scheduled posts). */
export async function register() {
  // Keep the import inside this exact check: Next.js removes the block from the Edge build only in this form.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { sendDueNewsEmails } = await import("@/lib/news-mail");
    const tick = () => sendDueNewsEmails().catch((err) => console.error("[news-mail] run failed:", err));
    setInterval(tick, EVERY_MS).unref();
  }
}
