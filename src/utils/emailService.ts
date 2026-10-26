import nodemailer from "nodemailer";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

const createTransporter = () => {
  const resendApiKey = process.env.RESEND_API_KEY;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (resendApiKey) {
    return nodemailer.createTransport({
      host: "smtp.resend.com",
      port: 465,
      secure: true,
      auth: {
        user: "resend",
        pass: resendApiKey,
      },
    });
  }

  if (smtpHost && smtpUser && smtpPass) {
    return nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
  }

  return null;
};

export const sendEmail = async (options: SendEmailOptions) => {
  const transporter = createTransporter();
  const from =
    process.env.EMAIL_FROM || "Tenant Management <noreply@tenantmgmt.local>";

  if (!transporter) {
    console.log("\n=======================================================");
    console.log("ℹ️  [EMAIL SERVICE] No SMTP credentials configured in .env");
    console.log(`📨 Recipient: ${options.to}`);
    console.log(`📌 Subject:   ${options.subject}`);
    console.log("-------------------------------------------------------");
    console.log(options.text || options.html);
    console.log("=======================================================\n");
    return { success: true, simulated: true };
  }

  try {
    const info = await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    console.log(
      `[EMAIL SERVICE] Email sent successfully to ${options.to}: ${info.messageId}`,
    );
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(
      `[EMAIL SERVICE ERROR] Failed to send email to ${options.to}:`,
      error.message,
    );
    // Don't crash the request if third party email fails, but log the error
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
