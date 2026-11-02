import { escapeHtml } from "../../core/utils/text";

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const BRAND = "Nivaasa";

/** Shared dark-theme layout. Every interpolated value must be escaped. */
const layout = (title: string, bodyHtml: string): string => `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(title)}</title></head>
  <body style="margin:0;padding:0;background-color:#0b1120;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f8fafc;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0b1120;padding:40px 20px;">
      <tr><td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:500px;background:linear-gradient(180deg,#1e293b 0%,#0f172a 100%);border:1px solid #334155;border-radius:16px;padding:36px 28px;">
          <tr><td align="center" style="padding-bottom:24px;">
            <div style="display:inline-block;padding:10px 16px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:9999px;">
              <span style="font-size:14px;font-weight:700;color:#60a5fa;letter-spacing:1px;text-transform:uppercase;">${BRAND}</span>
            </div>
          </td></tr>
          <tr><td align="center" style="padding-bottom:12px;"><h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">${escapeHtml(title)}</h1></td></tr>
          ${bodyHtml}
          <tr><td style="border-top:1px solid #1e293b;padding-top:20px;" align="center">
            <p style="margin:0;font-size:11px;color:#475569;">© ${new Date().getFullYear()} ${BRAND}. All rights reserved.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

const paragraph = (text: string) =>
  `<tr><td align="center" style="padding-bottom:28px;"><p style="margin:0;font-size:14px;line-height:22px;color:#94a3b8;text-align:center;">${escapeHtml(text)}</p></td></tr>`;

export const otpEmail = (
  otp: string,
  purpose: "verification" | "password_reset",
  ttlMinutes: number,
): EmailContent => {
  const title =
    purpose === "verification"
      ? "Verify Your Account Email"
      : "Reset Your Account Password";
  const message =
    purpose === "verification"
      ? `Welcome to ${BRAND}. Enter the 6-digit code below to verify your account.`
      : `We received a request to reset your ${BRAND} password. Enter the code below to continue.`;
  const html = layout(
    title,
    `${paragraph(message)}
     <tr><td align="center" style="padding-bottom:28px;">
       <div style="background-color:#030712;border:1px dashed #3b82f6;border-radius:12px;padding:18px 32px;display:inline-block;">
         <span style="font-size:32px;font-weight:800;letter-spacing:8px;color:#38bdf8;font-family:monospace;">${escapeHtml(otp)}</span>
       </div>
     </td></tr>
     <tr><td align="center" style="padding-bottom:24px;">
       <p style="margin:0;font-size:13px;color:#f59e0b;font-weight:500;">This code expires in ${ttlMinutes} minutes.</p>
       <p style="margin:8px 0 0 0;font-size:12px;color:#64748b;">If you did not request this code, you can safely ignore this email.</p>
     </td></tr>`,
  );
  return {
    // The OTP is intentionally NOT in the subject (subjects show in lock screens / logs).
    subject: `[${BRAND}] ${title}`,
    html,
    text: `${title}\n\n${message}\n\nYour code: ${otp}\n\nThis code expires in ${ttlMinutes} minutes.`,
  };
};

export const adminInviteEmail = (
  inviteLink: string,
  inviterName: string,
  ttlDays: number,
): EmailContent => {
  const title = "You're Invited to Manage Properties";
  const safeLink = escapeHtml(inviteLink);
  const html = layout(
    title,
    `${paragraph(`${inviterName} invited you to join ${BRAND} as a Property Admin. Set your password to get started.`)}
     <tr><td align="center" style="padding-bottom:28px;">
       <a href="${safeLink}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#1a56e8,#3575f0);color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;">Accept Invitation &amp; Set Password</a>
     </td></tr>
     <tr><td align="center" style="padding-bottom:24px;">
       <p style="margin:0;font-size:12px;color:#64748b;">This invitation expires in ${ttlDays} days.<br/>Or paste this link in your browser:<br/><span style="color:#60a5fa;word-break:break-all;">${safeLink}</span></p>
     </td></tr>`,
  );
  return {
    subject: `[${BRAND}] You're invited as a Property Admin`,
    html,
    text: `${inviterName} invited you as a Property Admin on ${BRAND}. Accept within ${ttlDays} days: ${inviteLink}`,
  };
};

export const welcomeEmail = (name: string): EmailContent => {
  const title = `Welcome to ${BRAND}, ${name}!`;
  return {
    subject: `Welcome to ${BRAND}!`,
    html: layout(
      title,
      paragraph(
        "Your account is verified. You now have full access to your property portal, flats, tenants and revenue analytics.",
      ),
    ),
    text: `Welcome to ${BRAND}, ${name}! Your account is now active.`,
  };
};
