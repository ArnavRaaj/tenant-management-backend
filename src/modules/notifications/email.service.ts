import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../../config/env";
import { logger } from "../../core/logger";
import { enqueueJob, registerJobHandler } from "../../core/queue/jobQueue";
import type { EmailContent } from "./email.templates";

export interface EmailJobData extends EmailContent {
  to: string;
}

declare module "../../core/queue/jobQueue" {
  interface JobRegistry {
    "email.send": EmailJobData;
  }
}

let transporter: Transporter | null | undefined;
let transportLabel = "simulated";

/**
 * One pooled SMTP transport for the process lifetime (the old code rebuilt
 * the transport — and re-read .env — on every single email).
 */
const getTransporter = (): Transporter | null => {
  if (transporter !== undefined) return transporter;
  const { resendApiKey, smtpHost, smtpPort, smtpUser, smtpPass } = config.email;
  const pool = { pool: true, maxConnections: 5, maxMessages: 100 } as const;

  if (resendApiKey) {
    transporter = nodemailer.createTransport({
      ...pool,
      host: "smtp.resend.com",
      port: 465,
      secure: true,
      auth: { user: "resend", pass: resendApiKey },
    });
    transportLabel = "Resend";
  } else if (
    smtpUser &&
    smtpPass &&
    (smtpHost.includes("gmail") || smtpUser.endsWith("@gmail.com"))
  ) {
    transporter = nodemailer.createTransport({
      ...pool,
      service: "gmail",
      auth: { user: smtpUser, pass: smtpPass },
    });
    transportLabel = "Gmail SMTP";
  } else if (smtpHost && smtpUser && smtpPass) {
    transporter = nodemailer.createTransport({
      ...pool,
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });
    transportLabel = `SMTP ${smtpHost}`;
  } else {
    transporter = null;
  }
  return transporter;
};

const fromAddress = (): string =>
  config.email.from ||
  (config.email.smtpUser
    ? `Nivaasa <${config.email.smtpUser}>`
    : "Nivaasa <noreply@nivaasa.local>");

/**
 * Sends immediately. THROWS on failure so the job queue retries with backoff
 * (previously failures were swallowed and counted as successes).
 */
export const deliverEmail = async (job: EmailJobData): Promise<void> => {
  const tx = getTransporter();
  if (!tx) {
    if (config.isProduction) {
      throw new Error("No email transport configured");
    }
    // Dev without SMTP: print the email so OTPs/links can be used locally.
    logger.info(
      { to: job.to, subject: job.subject },
      `[EMAIL SIMULATED]\n${job.text}`,
    );
    return;
  }
  const info = await tx.sendMail({
    from: fromAddress(),
    to: job.to,
    subject: job.subject,
    html: job.html,
    text: job.text,
  });
  logger.info(
    { messageId: info.messageId, via: transportLabel },
    "Email delivered",
  );
};

registerJobHandler("email.send", deliverEmail);

/** Non-blocking: returns as soon as the job is queued. */
export const sendEmail = (to: string, content: EmailContent): Promise<void> =>
  enqueueJob("email.send", { to, ...content });

export const verifyEmailTransport = async (): Promise<void> => {
  const tx = getTransporter();
  if (!tx) {
    logger.warn(
      "Email: no SMTP/Resend credentials — running in simulated mode",
    );
    return;
  }
  try {
    await tx.verify();
    logger.info({ via: transportLabel }, "Email transport verified");
  } catch (err) {
    logger.error(
      { err: (err as Error).message, via: transportLabel },
      "Email transport verification failed (Gmail needs a 16-char App Password)",
    );
  }
};

export const closeEmailTransport = (): void => {
  transporter?.close();
  transporter = undefined;
};
