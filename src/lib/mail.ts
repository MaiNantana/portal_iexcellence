import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import nodemailer from "nodemailer";

// MAIL_TRANSPORT=ses → Amazon SES API (credentials from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION);
// otherwise SMTP when SMTP_HOST is set; otherwise (dev only) messages are printed to the server console.
function createTransport() {
  if (process.env.MAIL_TRANSPORT === "ses") {
    return nodemailer.createTransport({ SES: { sesClient: new SESv2Client({ region: process.env.AWS_REGION }), SendEmailCommand } });
  }
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return null;
}

const transport = createTransport();

export async function sendMail(to: string, subject: string, text: string) {
  if (!transport) {
    if (process.env.NODE_ENV === "production") throw new Error("No mail transport configured (MAIL_TRANSPORT=ses or SMTP_HOST)");
    console.log(`\n[mail:dev] to=${to}\n  subject: ${subject}\n  ${text.replace(/\n/g, "\n  ")}\n`);
    return;
  }
  await transport.sendMail({ from: process.env.MAIL_FROM ?? process.env.SMTP_FROM ?? process.env.SMTP_USER, to, subject, text });
}
