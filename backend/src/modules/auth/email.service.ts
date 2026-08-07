import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    const port = this.config.get<number>('SMTP_PORT', 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASSWORD');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
      });
    } else {
      this.logger.warn('SMTP not configured — reset codes will be logged to console only');
    }
  }

  async sendPasswordResetEmail(to: string, otp: string, displayName?: string): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@ai-hrms.com');
    const name = displayName || to.split('@')[0];
    const year = new Date().getFullYear();

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Password Reset Code — Ai-HRMS</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 60%,#3b82f6 100%);padding:36px 40px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="background:rgba(255,255,255,0.15);border-radius:12px;padding:10px 20px;">
                    <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Ai-HRMS</span>
                    <span style="font-size:11px;color:rgba(255,255,255,0.7);display:block;margin-top:2px;letter-spacing:1px;text-transform:uppercase;">Workforce Management</span>
                  </td>
                </tr>
              </table>
              <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:20px 0 0;font-weight:400;">Password Reset Request</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="font-size:16px;color:#1e293b;margin:0 0 8px;font-weight:600;">Hi ${name},</p>
              <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 28px;">
                We received a request to reset your Ai-HRMS account password. Use the code below to complete your reset. This code is valid for <strong style="color:#1e293b;">15 minutes</strong>.
              </p>

              <!-- OTP Box -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:0 0 28px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background:#f8fafc;border:2px dashed #cbd5e1;border-radius:14px;padding:24px 48px;text-align:center;">
                          <p style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">Your Reset Code</p>
                          <p style="font-size:42px;font-weight:800;color:#1e3a5f;letter-spacing:10px;margin:0;font-family:'Courier New',Courier,monospace;">${otp}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Instructions -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-radius:10px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="font-size:13px;color:#1d4ed8;font-weight:600;margin:0 0 6px;">How to reset your password:</p>
                    <ol style="font-size:13px;color:#3b82f6;margin:0;padding-left:18px;line-height:1.8;">
                      <li style="color:#1e40af;">Go to the Ai-HRMS password reset page</li>
                      <li style="color:#1e40af;">Enter your email address</li>
                      <li style="color:#1e40af;">Enter the 6-digit code above</li>
                      <li style="color:#1e40af;">Choose a strong new password</li>
                    </ol>
                  </td>
                </tr>
              </table>

              <!-- Security notice -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="font-size:13px;color:#92400e;margin:0;line-height:1.5;">
                      <strong>Didn't request this?</strong> You can safely ignore this email. Your password will not change unless you complete the reset with this code.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
                For security, this code will expire in 15 minutes and can only be used once.
                If you need a new code, visit the forgot password page and request again.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 40px;text-align:center;">
              <p style="font-size:12px;color:#94a3b8;margin:0 0 4px;">This is an automated message from Ai-HRMS — Workforce Management Management System.</p>
              <p style="font-size:12px;color:#cbd5e1;margin:0;">© ${year} Spinach Informatics. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    if (!this.transporter) {
      this.logger.warn(`[DEV — no SMTP] Password reset OTP for <${to}>: ${otp}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"Ai-HRMS – Workforce Management" <${from}>`,
        to,
        subject: `${otp} is your Ai-HRMS password reset code`,
        html,
        text: `Hi ${name},\n\nYour Ai-HRMS password reset code is: ${otp}\n\nThis code expires in 15 minutes and can only be used once.\n\nIf you didn't request this, you can safely ignore this email.\n\n© ${year} Spinach Informatics`,
      });
      this.logger.log(`Password reset email sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send reset email to ${to}`, err);
      throw err;
    }
  }

  private wrapNotice(opts: { title: string; heading: string; bodyHtml: string; accent: string }): string {
    const year = new Date().getFullYear();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${opts.title} — Ai-HRMS</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 60%,#3b82f6 100%);padding:36px 40px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="background:rgba(255,255,255,0.15);border-radius:12px;padding:10px 20px;">
                    <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Ai-HRMS</span>
                    <span style="font-size:11px;color:rgba(255,255,255,0.7);display:block;margin-top:2px;letter-spacing:1px;text-transform:uppercase;">Workforce Management</span>
                  </td>
                </tr>
              </table>
              <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:20px 0 0;font-weight:400;">${opts.heading}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              ${opts.bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 40px;text-align:center;">
              <p style="font-size:12px;color:#94a3b8;margin:0 0 4px;">This is an automated message from Ai-HRMS — Workforce Management Management System.</p>
              <p style="font-size:12px;color:#cbd5e1;margin:0;">© ${year} Spinach Informatics. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  async sendAccountLockedEmail(to: string, displayName?: string): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@ai-hrms.com');
    const name = displayName || to.split('@')[0];

    const html = this.wrapNotice({
      title: 'Account Locked',
      heading: 'Account Security Notice',
      accent: '#dc2626',
      bodyHtml: `
        <p style="font-size:16px;color:#1e293b;margin:0 0 8px;font-weight:600;">Hi ${name},</p>
        <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 24px;">
          Your Ai-HRMS account has been temporarily locked due to multiple failed login attempts.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;margin-bottom:24px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="font-size:13px;color:#991b1b;margin:0;line-height:1.5;">
                For your security, sign-in has been disabled until an administrator reactivates your account.
              </p>
            </td>
          </tr>
        </table>
        <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
          Please contact your administrator to have your account reactivated. If you believe this was a mistake, let them know as soon as possible.
        </p>
      `,
    });

    if (!this.transporter) {
      this.logger.warn(`[DEV — no SMTP] Account locked notice for <${to}>`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"Ai-HRMS – Workforce Management" <${from}>`,
        to,
        subject: 'Your Ai-HRMS account has been locked',
        html,
        text: `Hi ${name},\n\nYour Ai-HRMS account has been temporarily locked due to multiple failed login attempts. Please contact your administrator for account reactivation.\n\n© ${new Date().getFullYear()} Spinach Informatics`,
      });
      this.logger.log(`Account locked email sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send account locked email to ${to}`, err);
    }
  }

  async sendAccountUnlockedEmail(to: string, displayName?: string): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@ai-hrms.com');
    const name = displayName || to.split('@')[0];

    const html = this.wrapNotice({
      title: 'Account Reactivated',
      heading: 'Account Security Notice',
      accent: '#16a34a',
      bodyHtml: `
        <p style="font-size:16px;color:#1e293b;margin:0 0 8px;font-weight:600;">Hi ${name},</p>
        <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 24px;">
          Your Ai-HRMS account has been reactivated by an administrator. You can now sign in as usual.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;margin-bottom:24px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="font-size:13px;color:#166534;margin:0;line-height:1.5;">
                If you didn't expect this change or have any concerns about your account's security, please contact your administrator.
              </p>
            </td>
          </tr>
        </table>
      `,
    });

    if (!this.transporter) {
      this.logger.warn(`[DEV — no SMTP] Account unlocked notice for <${to}>`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"Ai-HRMS – Workforce Management" <${from}>`,
        to,
        subject: 'Your Ai-HRMS account has been reactivated',
        html,
        text: `Hi ${name},\n\nYour Ai-HRMS account has been reactivated by an administrator. You can now sign in as usual.\n\n© ${new Date().getFullYear()} Spinach Informatics`,
      });
      this.logger.log(`Account unlocked email sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send account unlocked email to ${to}`, err);
    }
  }

  async sendAdminLockoutNotification(to: string, lockedUserEmail: string, lockedUserName?: string): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@ai-hrms.com');
    const name = lockedUserName || lockedUserEmail.split('@')[0];

    const html = this.wrapNotice({
      title: 'User Account Locked',
      heading: 'Security Alert',
      accent: '#dc2626',
      bodyHtml: `
        <p style="font-size:16px;color:#1e293b;margin:0 0 8px;font-weight:600;">Hi,</p>
        <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 24px;">
          The account for <strong style="color:#1e293b;">${name}</strong> (${lockedUserEmail}) has been automatically locked
          after multiple failed login attempts.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;margin-bottom:24px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="font-size:13px;color:#991b1b;margin:0;line-height:1.5;">
                You can review and reactivate this account from the User Management page if appropriate.
              </p>
            </td>
          </tr>
        </table>
      `,
    });

    if (!this.transporter) {
      this.logger.warn(`[DEV — no SMTP] Admin lockout notification for <${to}> (locked user: ${lockedUserEmail})`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"Ai-HRMS – Workforce Management" <${from}>`,
        to,
        subject: `Account locked: ${name}`,
        html,
        text: `The account for ${name} (${lockedUserEmail}) has been automatically locked after multiple failed login attempts. You can review and reactivate it from the User Management page.\n\n© ${new Date().getFullYear()} Spinach Informatics`,
      });
      this.logger.log(`Admin lockout notification sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send admin lockout notification to ${to}`, err);
    }
  }

  // ── Multi-factor authentication ───────────────────────────────────

  async sendMfaEnabledEmail(to: string, displayName?: string): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@ai-hrms.com');
    const name = displayName || to.split('@')[0];

    const html = this.wrapNotice({
      title: 'MFA Enabled',
      heading: 'Account Security Notice',
      accent: '#16a34a',
      bodyHtml: `
        <p style="font-size:16px;color:#1e293b;margin:0 0 8px;font-weight:600;">Hi ${name},</p>
        <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 24px;">
          Multi-factor authentication has been enabled on your Ai-HRMS account. You'll now be asked for a verification code from your authenticator app each time you sign in.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;margin-bottom:24px;">
          <tr><td style="padding:16px 20px;"><p style="font-size:13px;color:#166534;margin:0;line-height:1.5;">Store your recovery codes somewhere safe — they're the only way back into your account if you lose access to your authenticator app.</p></td></tr>
        </table>
        <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">If you didn't make this change, contact your administrator immediately.</p>
      `,
    });

    if (!this.transporter) {
      this.logger.warn(`[DEV — no SMTP] MFA enabled notice for <${to}>`);
      return;
    }
    try {
      await this.transporter.sendMail({
        from: `"Ai-HRMS – Workforce Management" <${from}>`,
        to,
        subject: 'Multi-factor authentication enabled on your account',
        html,
        text: `Hi ${name},\n\nMFA has been enabled on your Ai-HRMS account.\n\nIf you didn't make this change, contact your administrator immediately.\n\n© ${new Date().getFullYear()} Spinach Informatics`,
      });
      this.logger.log(`MFA enabled email sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send MFA enabled email to ${to}`, err);
    }
  }

  async sendMfaDisabledEmail(to: string, displayName?: string): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@ai-hrms.com');
    const name = displayName || to.split('@')[0];

    const html = this.wrapNotice({
      title: 'MFA Disabled',
      heading: 'Account Security Notice',
      accent: '#dc2626',
      bodyHtml: `
        <p style="font-size:16px;color:#1e293b;margin:0 0 8px;font-weight:600;">Hi ${name},</p>
        <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 24px;">
          Multi-factor authentication has been disabled on your Ai-HRMS account.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;margin-bottom:24px;">
          <tr><td style="padding:16px 20px;"><p style="font-size:13px;color:#991b1b;margin:0;line-height:1.5;">If you did not make this change, your account may be compromised — contact your administrator immediately.</p></td></tr>
        </table>
      `,
    });

    if (!this.transporter) {
      this.logger.warn(`[DEV — no SMTP] MFA disabled notice for <${to}>`);
      return;
    }
    try {
      await this.transporter.sendMail({
        from: `"Ai-HRMS – Workforce Management" <${from}>`,
        to,
        subject: 'Multi-factor authentication disabled on your account',
        html,
        text: `Hi ${name},\n\nMFA has been disabled on your Ai-HRMS account.\n\nIf you didn't make this change, contact your administrator immediately.\n\n© ${new Date().getFullYear()} Spinach Informatics`,
      });
      this.logger.log(`MFA disabled email sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send MFA disabled email to ${to}`, err);
    }
  }

  async sendRecoveryCodeUsedEmail(to: string, displayName?: string): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@ai-hrms.com');
    const name = displayName || to.split('@')[0];

    const html = this.wrapNotice({
      title: 'Recovery Code Used',
      heading: 'Account Security Alert',
      accent: '#d97706',
      bodyHtml: `
        <p style="font-size:16px;color:#1e293b;margin:0 0 8px;font-weight:600;">Hi ${name},</p>
        <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 24px;">
          A recovery code was just used to sign in to your Ai-HRMS account instead of your authenticator app.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;margin-bottom:24px;">
          <tr><td style="padding:16px 20px;"><p style="font-size:13px;color:#92400e;margin:0;line-height:1.5;">That code can no longer be used again. If this wasn't you, secure your account and regenerate your recovery codes immediately.</p></td></tr>
        </table>
      `,
    });

    if (!this.transporter) {
      this.logger.warn(`[DEV — no SMTP] Recovery code used notice for <${to}>`);
      return;
    }
    try {
      await this.transporter.sendMail({
        from: `"Ai-HRMS – Workforce Management" <${from}>`,
        to,
        subject: 'A recovery code was used to sign in to your account',
        html,
        text: `Hi ${name},\n\nA recovery code was just used to sign in to your Ai-HRMS account.\n\nIf this wasn't you, secure your account immediately.\n\n© ${new Date().getFullYear()} Spinach Informatics`,
      });
      this.logger.log(`Recovery code used email sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send recovery code used email to ${to}`, err);
    }
  }

  async sendNewTrustedDeviceEmail(to: string, deviceLabel: string, displayName?: string): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@ai-hrms.com');
    const name = displayName || to.split('@')[0];

    const html = this.wrapNotice({
      title: 'New Trusted Device',
      heading: 'Account Security Notice',
      accent: '#2563eb',
      bodyHtml: `
        <p style="font-size:16px;color:#1e293b;margin:0 0 8px;font-weight:600;">Hi ${name},</p>
        <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 24px;">
          A new device (<strong>${deviceLabel}</strong>) was trusted on your Ai-HRMS account and will skip MFA verification for the next 30 days.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-radius:10px;margin-bottom:24px;">
          <tr><td style="padding:16px 20px;"><p style="font-size:13px;color:#1d4ed8;margin:0;line-height:1.5;">If this wasn't you, revoke this device from Security Settings and change your password immediately.</p></td></tr>
        </table>
      `,
    });

    if (!this.transporter) {
      this.logger.warn(`[DEV — no SMTP] New trusted device notice for <${to}>: ${deviceLabel}`);
      return;
    }
    try {
      await this.transporter.sendMail({
        from: `"Ai-HRMS – Workforce Management" <${from}>`,
        to,
        subject: 'A new device was trusted on your account',
        html,
        text: `Hi ${name},\n\nA new device (${deviceLabel}) was trusted on your Ai-HRMS account for 30 days.\n\nIf this wasn't you, revoke it from Security Settings immediately.\n\n© ${new Date().getFullYear()} Spinach Informatics`,
      });
      this.logger.log(`New trusted device email sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send new trusted device email to ${to}`, err);
    }
  }

  async sendMfaRateLimitedEmail(to: string, displayName?: string): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@ai-hrms.com');
    const name = displayName || to.split('@')[0];

    const html = this.wrapNotice({
      title: 'Repeated Failed MFA Attempts',
      heading: 'Account Security Alert',
      accent: '#dc2626',
      bodyHtml: `
        <p style="font-size:16px;color:#1e293b;margin:0 0 8px;font-weight:600;">Hi ${name},</p>
        <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 24px;">
          We detected 5 consecutive failed verification attempts on your Ai-HRMS account. MFA verification has been temporarily locked for 5 minutes.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;margin-bottom:24px;">
          <tr><td style="padding:16px 20px;"><p style="font-size:13px;color:#991b1b;margin:0;line-height:1.5;">If this wasn't you, your password may be compromised — change it and contact your administrator.</p></td></tr>
        </table>
      `,
    });

    if (!this.transporter) {
      this.logger.warn(`[DEV — no SMTP] Repeated failed MFA attempts notice for <${to}>`);
      return;
    }
    try {
      await this.transporter.sendMail({
        from: `"Ai-HRMS – Workforce Management" <${from}>`,
        to,
        subject: 'Repeated failed MFA attempts on your account',
        html,
        text: `Hi ${name},\n\nWe detected 5 consecutive failed MFA verification attempts on your account. Verification has been locked for 5 minutes.\n\nIf this wasn't you, change your password and contact your administrator.\n\n© ${new Date().getFullYear()} Spinach Informatics`,
      });
      this.logger.log(`MFA rate limited email sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send MFA rate limited email to ${to}`, err);
    }
  }

  // ── Organization registration & approval ─────────────────────────

  async sendOrganizationSubmittedEmail(to: string, tenant: any): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@ai-hrms.com');

    const html = this.wrapNotice({
      title: 'New Organization Registration',
      heading: 'Super Admin Alert',
      accent: '#2563eb',
      bodyHtml: `
        <p style="font-size:16px;color:#1e293b;margin:0 0 8px;font-weight:600;">A new organization is awaiting review.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;margin:16px 0 24px;">
          <tr><td style="padding:16px 20px;font-size:13px;color:#334155;line-height:1.8;">
            <strong>Legal name:</strong> ${tenant.legal_name || tenant.name}<br/>
            <strong>Contact person:</strong> ${tenant.contact_person_name || '—'}<br/>
            <strong>Phone:</strong> ${tenant.phone_number || '—'}<br/>
            <strong>Email:</strong> ${tenant.primary_email || '—'}<br/>
            <strong>Branches:</strong> ${tenant.estimated_branch_count ?? '—'}<br/>
            <strong>Employees:</strong> ${tenant.estimated_employee_count ?? '—'}
          </td></tr>
        </table>
        <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">Review it from the Organization Approvals dashboard.</p>
      `,
    });

    if (!this.transporter) {
      this.logger.warn(`[DEV — no SMTP] New organization registration notice for <${to}>: ${tenant.legal_name || tenant.name}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"Ai-HRMS – Workforce Management" <${from}>`,
        to,
        subject: `New organization registration: ${tenant.legal_name || tenant.name}`,
        html,
        text: `A new organization (${tenant.legal_name || tenant.name}) has submitted a registration and is awaiting review.\n\n© ${new Date().getFullYear()} Spinach Informatics`,
      });
      this.logger.log(`Organization submitted email sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send organization submitted email to ${to}`, err);
    }
  }

  async sendOrganizationApprovedEmail(to: string, tenant: any): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@ai-hrms.com');
    const loginUrl = `${this.config.get<string>('FRONTEND_URL', 'http://localhost:3000')}/login`;

    const html = this.wrapNotice({
      title: 'Organization Approved',
      heading: 'Welcome to Ai-HRMS',
      accent: '#16a34a',
      bodyHtml: `
        <p style="font-size:16px;color:#1e293b;margin:0 0 8px;font-weight:600;">Congratulations!</p>
        <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 24px;">
          <strong>${tenant.legal_name || tenant.name}</strong> has been approved and is now active on Ai-HRMS. Attendance, payroll, recruitment, and reporting are ready to use.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="padding:0 0 24px;">
              <a href="${loginUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:10px;text-decoration:none;">Sign In</a>
            </td>
          </tr>
        </table>
      `,
    });

    if (!this.transporter) {
      this.logger.warn(`[DEV — no SMTP] Organization approved welcome email for <${to}>`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"Ai-HRMS – Workforce Management" <${from}>`,
        to,
        subject: `${tenant.legal_name || tenant.name} is now active on Ai-HRMS`,
        html,
        text: `Congratulations! ${tenant.legal_name || tenant.name} has been approved and is now active. Sign in at ${loginUrl}\n\n© ${new Date().getFullYear()} Spinach Informatics`,
      });
      this.logger.log(`Organization approved email sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send organization approved email to ${to}`, err);
    }
  }

  async sendOrganizationRejectedEmail(to: string, tenant: any, reason: string): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@ai-hrms.com');

    const html = this.wrapNotice({
      title: 'Registration Update',
      heading: 'Organization Registration',
      accent: '#dc2626',
      bodyHtml: `
        <p style="font-size:16px;color:#1e293b;margin:0 0 8px;font-weight:600;">Hi,</p>
        <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 16px;">
          We were unable to approve the registration for <strong>${tenant.legal_name || tenant.name}</strong>.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;margin-bottom:24px;">
          <tr><td style="padding:16px 20px;"><p style="font-size:13px;color:#991b1b;margin:0;line-height:1.5;">${reason}</p></td></tr>
        </table>
        <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">If you have questions, please reach out to our support team.</p>
      `,
    });

    if (!this.transporter) {
      this.logger.warn(`[DEV — no SMTP] Organization rejected notice for <${to}>: ${reason}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"Ai-HRMS – Workforce Management" <${from}>`,
        to,
        subject: `Update on your ${tenant.legal_name || tenant.name} registration`,
        html,
        text: `We were unable to approve the registration for ${tenant.legal_name || tenant.name}.\n\nReason: ${reason}\n\n© ${new Date().getFullYear()} Spinach Informatics`,
      });
      this.logger.log(`Organization rejected email sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send organization rejected email to ${to}`, err);
    }
  }

  async sendOrganizationClarificationEmail(to: string, tenant: any, notes: string): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@ai-hrms.com');

    const html = this.wrapNotice({
      title: 'More Information Needed',
      heading: 'Organization Registration',
      accent: '#d97706',
      bodyHtml: `
        <p style="font-size:16px;color:#1e293b;margin:0 0 8px;font-weight:600;">Hi,</p>
        <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 16px;">
          We need a bit more information to continue reviewing the registration for <strong>${tenant.legal_name || tenant.name}</strong>.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;margin-bottom:24px;">
          <tr><td style="padding:16px 20px;"><p style="font-size:13px;color:#92400e;margin:0;line-height:1.5;">${notes}</p></td></tr>
        </table>
        <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">Please reply to this email or contact our support team with the requested details.</p>
      `,
    });

    if (!this.transporter) {
      this.logger.warn(`[DEV — no SMTP] Clarification request for <${to}>: ${notes}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"Ai-HRMS – Workforce Management" <${from}>`,
        to,
        subject: `More information needed for your ${tenant.legal_name || tenant.name} registration`,
        html,
        text: `We need more information to continue reviewing the registration for ${tenant.legal_name || tenant.name}.\n\n${notes}\n\n© ${new Date().getFullYear()} Spinach Informatics`,
      });
      this.logger.log(`Organization clarification email sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send organization clarification email to ${to}`, err);
    }
  }

  // ── Generic templated send (Recruitment candidate communication) ─────

  /** Sends a pre-rendered subject/body pair (placeholders already substituted by the caller). */
  async sendGenericEmail(to: string, subject: string, bodyText: string): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@ai-hrms.com');
    const html = this.wrapNotice({
      title: subject,
      heading: subject,
      accent: '#2563eb',
      bodyHtml: `<div style="font-size:15px;color:#334155;line-height:1.7;white-space:pre-wrap;">${bodyText.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))}</div>`,
    });

    if (!this.transporter) {
      this.logger.warn(`[DEV — no SMTP] Email to <${to}> — ${subject}:\n${bodyText}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"Ai-HRMS – Workforce Management" <${from}>`,
        to,
        subject,
        html,
        text: bodyText,
      });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}`, err);
      throw err;
    }
  }

  async sendChangeRequestDecisionEmail(to: string, status: string, notes?: string, requestLabel = 'change request'): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@ai-hrms.com');
    const approved = status === 'approved';
    const label = requestLabel.replace(/\b\w/g, (char) => char.toUpperCase());
    const heading = approved ? `${label} Approved` : status === 'rejected' ? `${label} Rejected` : `${label}: Documents or Information Requested`;

    const html = this.wrapNotice({
      title: heading,
      heading,
      accent: approved ? '#16a34a' : '#d97706',
      bodyHtml: `
        <p style="font-size:16px;color:#1e293b;margin:0 0 8px;font-weight:600;">Hi,</p>
        <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 16px;">
          ${approved
            ? `Your ${requestLabel} has been approved.`
            : status === 'rejected'
              ? `Your ${requestLabel} was not approved.`
              : `Internal staff requested supporting documents or more information for your ${requestLabel}.`}
        </p>
        ${notes ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;margin-bottom:24px;"><tr><td style="padding:16px 20px;"><p style="font-size:13px;color:#334155;margin:0;line-height:1.5;">${notes}</p></td></tr></table>` : ''}
      `,
    });

    if (!this.transporter) {
      this.logger.warn(`[DEV — no SMTP] Change request ${status} notice for <${to}>`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"Ai-HRMS – Workforce Management" <${from}>`,
        to,
        subject: heading,
        html,
        text: `${heading}${notes ? `\n\n${notes}` : ''}\n\n© ${new Date().getFullYear()} Spinach Informatics`,
      });
      this.logger.log(`Change request ${status} email sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send change request ${status} email to ${to}`, err);
    }
  }
}
