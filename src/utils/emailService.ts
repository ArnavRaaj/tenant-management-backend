import nodemailer, { Transporter } from "nodemailer";
import dotenv from "dotenv";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface TransporterDetails {
  transporter: Transporter;
  type: string;
  user: string;
  from: string;
}

const cleanString = (val?: string): string => {
  if (!val) return "";
  return val.replace(/^["']|["']$/g, "").trim();
};

export const resolveEmailConfig = () => {
  // Refresh dotenv to pick up any dynamic changes to .env in real-time
  dotenv.config();

  const resendApiKey = cleanString(process.env.RESEND_API_KEY);

  const smtpHost = cleanString(process.env.SMTP_HOST);
  const smtpPortStr = cleanString(process.env.SMTP_PORT);

  // Support SMTP_USER, GMAIL_USER, or GOOGLE_SMTP_USER
  const smtpUser =
    cleanString(process.env.SMTP_USER) ||
    cleanString(process.env.GMAIL_USER) ||
    cleanString(process.env.GOOGLE_SMTP_USER);

  // Support SMTP_PASS, GMAIL_APP_PASSWORD, GMAIL_PASS, or GOOGLE_SMTP_PASS
  const rawPass =
    process.env.SMTP_PASS ||
    process.env.GMAIL_APP_PASSWORD ||
    process.env.GMAIL_PASS ||
    process.env.GOOGLE_SMTP_PASS ||
    "";

  // Google App Passwords often have spaces: "abcd efgh ijkl mnop" -> strip all whitespace
  const smtpPass = rawPass.replace(/^["']|["']$/g, "").replace(/\s+/g, "");

  const isGmail =
    smtpHost.toLowerCase().includes("gmail") ||
    smtpHost.toLowerCase() === "google" ||
    smtpUser.toLowerCase().endsWith("@gmail.com") ||
    smtpUser.toLowerCase().endsWith("@googlemail.com") ||
    Boolean(process.env.GMAIL_USER || process.env.GMAIL_APP_PASSWORD);

  const smtpPort = smtpPortStr
    ? parseInt(smtpPortStr, 10)
    : isGmail
      ? 465
      : 587;

  // Google SMTP requires the 'from' address to match the authenticated Google account email
  let fromAddress = cleanString(process.env.EMAIL_FROM);
  if (!fromAddress || fromAddress.includes("tenantmgmt.local")) {
    fromAddress = smtpUser
      ? `Tenant Management <${smtpUser}>`
      : "Tenant Management <noreply@tenantmgmt.local>";
  }

  return {
    resendApiKey,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    isGmail,
    fromAddress,
  };
};

export const createTransporter = (): TransporterDetails | null => {
  const config = resolveEmailConfig();

  // 1. Resend API
  if (config.resendApiKey) {
    return {
      transporter: nodemailer.createTransport({
        host: "smtp.resend.com",
        port: 465,
        secure: true,
        auth: {
          user: "resend",
          pass: config.resendApiKey,
        },
      }),
      type: "Resend",
      user: "resend",
      from: config.fromAddress,
    };
  }

  // 2. Google SMTP / Gmail (using nodemailer's dedicated "gmail" service)
  if (config.isGmail && config.smtpUser && config.smtpPass) {
    return {
      transporter: nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: config.smtpUser,
          pass: config.smtpPass,
        },
      }),
      type: "Google SMTP (Gmail)",
      user: config.smtpUser,
      from: config.fromAddress,
    };
  }

  // 3. Generic Custom SMTP (Brevo, AWS SES, SendGrid, etc.)
  if (config.smtpHost && config.smtpUser && config.smtpPass) {
    return {
      transporter: nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpPort === 465,
        auth: {
          user: config.smtpUser,
          pass: config.smtpPass,
        },
      }),
      type: `SMTP (${config.smtpHost})`,
      user: config.smtpUser,
      from: config.fromAddress,
    };
  }

  return null;
};

/**
 * Validates connection to the configured email provider and logs status
 */
export const verifyEmailServiceConnection = async (): Promise<boolean> => {
  const details = createTransporter();
  if (!details) {
    console.log(
      "ℹ️  [EMAIL SERVICE] Running in Simulated Mode (No live credentials in .env). OTPs & Links will log directly to console.",
    );
    return false;
  }

  try {
    await details.transporter.verify();
    console.log(
      `✅ [EMAIL SERVICE] Verified connection to ${details.type} successfully for ${details.user}! Live emails are active.`,
    );
    return true;
  } catch (err: any) {
    console.error(
      `❌ [EMAIL SERVICE] Connection verification failed for ${details.type}:`,
      err.message,
    );
    if (details.type.includes("Google") || details.type.includes("Gmail")) {
      console.error("\n💡 [GOOGLE SMTP TROUBLESHOOTING TIP]");
      console.error(
        "   Authentication failed (535 Invalid Credentials). Google requires a 16-character App Password:",
      );
      console.error(
        "   1. Enable 2-Step Verification: https://myaccount.google.com/security",
      );
      console.error(
        "   2. Generate an App Password:   https://myaccount.google.com/apppasswords",
      );
      console.error(
        "   3. Add to .env: SMTP_USER=your_email@gmail.com and SMTP_PASS=your_16_char_password (or GMAIL_APP_PASSWORD)\n",
      );
    }
    return false;
  }
};

export const sendEmail = async (options: SendEmailOptions) => {
  const details = createTransporter();

  if (!details) {
    console.log("\n=======================================================");
    console.log(
      "ℹ️  [EMAIL SERVICE] Simulated Mode: No SMTP/Google credentials configured in .env",
    );
    console.log(`📨 Recipient: ${options.to}`);
    console.log(`📌 Subject:   ${options.subject}`);
    console.log("-------------------------------------------------------");
    console.log(options.text || options.html);
    console.log("=======================================================\n");
    return { success: true, simulated: true };
  }

  const { transporter, type, user, from } = details;

  try {
    const info = await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    console.log(
      `✅ [EMAIL SERVICE - ${type}] Email delivered to ${options.to} via ${user} (Message ID: ${info.messageId})`,
    );
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(
      `❌ [EMAIL SERVICE ERROR - ${type}] Failed to deliver email to ${options.to}:`,
      error.message,
    );

    if (type.includes("Google") || type.includes("Gmail")) {
      if (error.code === "EAUTH" || error.responseCode === 535) {
        console.error("\n💡 [GOOGLE SMTP TROUBLESHOOTING TIP]");
        console.error(
          "   Authentication failed (535 Invalid Credentials). Please ensure:",
        );
        console.error(
          "   1. 2-Step Verification is turned ON for your Google account.",
        );
        console.error(
          "   2. You generated a dedicated 16-character 'App Password' at https://myaccount.google.com/apppasswords",
        );
        console.error(
          "   3. You used the App Password in SMTP_PASS, NOT your standard Google account login password.\n",
        );
      }
    }

    // Don't crash request if email fails, but return error
    return { success: false, error: error.message };
  }
};

export const sendOtpEmail = async (
  email: string,
  otp: string,
  purpose: "verification" | "forgot_password",
) => {
  const isVerification = purpose === "verification";
  const title = isVerification
    ? "Verify Your Account Email"
    : "Reset Your Account Password";
  const message = isVerification
    ? "Welcome to Tenant Management System. Please enter the 6-digit verification code below to verify your account and activate your portal access."
    : "We received a request to reset your password for your Tenant Management account. Please enter the verification code below to proceed.";

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #0b1120; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b1120; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" max-width="500" border="0" cellspacing="0" cellpadding="0" style="max-width: 500px; background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%); border: 1px solid #334155; border-radius: 16px; padding: 36px 28px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <div style="display: inline-block; padding: 10px 16px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 9999px;">
                      <span style="font-size: 14px; font-weight: 700; color: #60a5fa; letter-spacing: 1px; text-transform: uppercase;">Tenant Management</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom: 12px;">
                    <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff;">${title}</h1>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom: 28px;">
                    <p style="margin: 0; font-size: 14px; line-height: 22px; color: #94a3b8; text-align: center;">${message}</p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom: 28px;">
                    <div style="background-color: #030712; border: 1px dashed #3b82f6; border-radius: 12px; padding: 18px 32px; display: inline-block;">
                      <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #38bdf8; font-family: monospace;">${otp}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <p style="margin: 0; font-size: 13px; color: #f59e0b; font-weight: 500;">
                      ⏰ This code will expire in 15 minutes.
                    </p>
                    <p style="margin: 8px 0 0 0; font-size: 12px; color: #64748b;">
                      If you did not request this code, you can safely ignore this email.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="border-top: 1px solid #1e293b; padding-top: 20px;" align="center">
                    <p style="margin: 0; font-size: 11px; color: #475569;">
                      © ${new Date().getFullYear()} Tenant Management System. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const text = `${title}\n\n${message}\n\nYour Verification Code: ${otp}\n\nThis code expires in 15 minutes.\nIf you did not request this, please ignore this email.`;

  return await sendEmail({
    to: email,
    subject: `[Tenant Management] ${title} - ${otp}`,
    html,
    text,
  });
};

export const sendAdminInviteEmail = async (
  email: string,
  inviteLink: string,
) => {
  const title = "You're Invited to Manage Properties";
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #0b1120; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b1120; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" max-width="500" border="0" cellspacing="0" cellpadding="0" style="max-width: 500px; background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%); border: 1px solid #334155; border-radius: 16px; padding: 36px 28px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <div style="display: inline-block; padding: 10px 16px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 9999px;">
                      <span style="font-size: 14px; font-weight: 700; color: #60a5fa; letter-spacing: 1px; text-transform: uppercase;">Tenant Management</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom: 12px;">
                    <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff;">Admin Invitation</h1>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom: 28px;">
                    <p style="margin: 0; font-size: 14px; line-height: 22px; color: #94a3b8; text-align: center;">
                      You have been invited to join Tenant Management System as a Property Admin. Click the button below to set up your password and access the portal.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom: 28px;">
                    <a href="${inviteLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1a56e8, #3575f0); color: #ffffff; text-decoration: none; font-weight: 600; font-size: 15px; border-radius: 8px; box-shadow: 0 4px 16px rgba(26,86,232,0.38);">
                      Accept Invitation & Set Password
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <p style="margin: 0; font-size: 12px; color: #64748b;">
                      Or copy and paste this link in your browser:<br/>
                      <span style="color: #60a5fa; word-break: break-all;">${inviteLink}</span>
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="border-top: 1px solid #1e293b; padding-top: 20px;" align="center">
                    <p style="margin: 0; font-size: 11px; color: #475569;">
                      © ${new Date().getFullYear()} Tenant Management System. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return await sendEmail({
    to: email,
    subject: "[Tenant Management] You're Invited as a Property Admin",
    html,
    text: `You have been invited as a Property Admin. Visit ${inviteLink} to accept your invitation.`,
  });
};
