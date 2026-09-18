import nodemailer from 'nodemailer';
import { randomInt } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface OtpEmailOptions {
  to: string;
  name: string;
  code: string;
  purpose?: 'login' | 'register' | 'delete';
}

export interface DevEmailPreview {
  to: string;
  name: string;
  code: string;
  subject: string;
  html: string;
  sentAt: string;
}

function readEnv(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf8');
      const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
      if (match) {
        const val = match[1].trim().replace(/^['"]|['"]$/g, '');
        process.env[key] = val;
        return val;
      }
    }
  } catch {}
  return undefined;
}

// In-memory storage for developer inspection
let latestDevEmail: DevEmailPreview | null = null;

export function getLatestDevEmail(): DevEmailPreview | null {
  return latestDevEmail;
}

export function generateOtp(): string {
  return randomInt(100000, 1000000).toString();
}

function getEmailStyles(): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
    body {
      margin: 0;
      padding: 0;
      background-color: #0b0e12;
      font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #f4f6f5;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .wrapper {
      width: 100%;
      background-color: #0b0e12;
      padding: 44px 16px;
    }
    .container {
      max-width: 540px;
      margin: 0 auto;
      background-color: #12171c;
      border: 1px solid rgba(224, 243, 241, 0.11);
      border-radius: 22px;
      overflow: hidden;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.75), 0 0 45px rgba(179, 243, 213, 0.05);
    }
    .header {
      padding: 36px 32px 24px;
      text-align: center;
      background: linear-gradient(180deg, rgba(179, 243, 213, 0.07) 0%, rgba(18, 23, 28, 0) 100%);
      border-bottom: 1px solid rgba(224, 243, 241, 0.08);
    }
    .brand-text {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -1.2px;
      color: #ffffff;
      line-height: 1;
    }
    .mint-dot {
      color: #b3f3d5;
    }
    .brand-subtitle {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #8d989f;
      font-weight: 700;
      margin-top: 8px;
    }
    .content {
      padding: 36px 32px 28px;
      text-align: center;
    }
    .badge-pill {
      display: inline-block;
      padding: 4px 12px;
      background: rgba(179, 243, 213, 0.08);
      border: 1px solid rgba(179, 243, 213, 0.22);
      border-radius: 999px;
      font-size: 9px;
      font-weight: 750;
      letter-spacing: 1.5px;
      color: #b3f3d5;
      text-transform: uppercase;
      margin-bottom: 18px;
    }
    .badge-pill-amber {
      display: inline-block;
      padding: 4px 12px;
      background: rgba(234, 203, 146, 0.1);
      border: 1px solid rgba(234, 203, 146, 0.28);
      border-radius: 999px;
      font-size: 9px;
      font-weight: 750;
      letter-spacing: 1.5px;
      color: #eacb92;
      text-transform: uppercase;
      margin-bottom: 18px;
    }
    .greeting {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.5px;
      color: #f4f6f5;
      margin: 0 0 12px;
      line-height: 1.25;
    }
    .message {
      font-size: 14px;
      line-height: 1.65;
      color: #8d989f;
      margin: 0 0 28px;
    }
    .otp-card {
      background-color: #0e1418;
      border: 1px solid rgba(179, 243, 213, 0.26);
      border-radius: 18px;
      padding: 24px 20px;
      margin: 0 auto 28px;
      box-shadow: inset 0 0 30px rgba(179, 243, 213, 0.04), 0 10px 25px rgba(0, 0, 0, 0.4);
      text-align: center;
    }
    .otp-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #8d989f;
      margin-bottom: 10px;
    }
    .otp-digits {
      font-family: 'SF Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace;
      font-size: 40px;
      font-weight: 800;
      letter-spacing: 10px;
      color: #b3f3d5;
      text-shadow: 0 0 25px rgba(179, 243, 213, 0.45);
      margin: 0;
      padding-left: 10px;
    }
    .expiry-tag {
      display: inline-block;
      margin-top: 14px;
      padding: 5px 14px;
      background: rgba(234, 203, 146, 0.12);
      border: 1px solid rgba(234, 203, 146, 0.3);
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      color: #eacb92;
    }
    .btn-primary {
      display: inline-block;
      background-color: #b3f3d5;
      color: #12291e !important;
      text-decoration: none;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 0.2px;
      padding: 14px 34px;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(179, 243, 213, 0.22);
    }
    .highlight-card {
      background: rgba(179, 243, 213, 0.04);
      border: 1px solid rgba(179, 243, 213, 0.14);
      border-radius: 16px;
      padding: 20px;
      text-align: left;
      margin: 0 0 26px;
    }
    .highlight-eyebrow {
      font-size: 9px;
      font-weight: 750;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #b3f3d5;
      margin-bottom: 6px;
    }
    .highlight-title {
      font-size: 15px;
      font-weight: 700;
      color: #f4f6f5;
      margin-bottom: 6px;
    }
    .highlight-body {
      font-size: 12px;
      color: #8d989f;
      line-height: 1.6;
    }
    .info-table {
      width: 100%;
      margin-bottom: 24px;
      background: #0e1418;
      border: 1px solid rgba(224, 243, 241, 0.09);
      border-radius: 16px;
      padding: 18px 20px;
      text-align: left;
    }
    .info-label {
      color: #8d989f;
      font-weight: 600;
      font-size: 13px;
      padding: 6px 0;
      width: 90px;
    }
    .info-value {
      color: #f4f6f5;
      font-family: 'SF Mono', 'Fira Code', Menlo, Consolas, monospace;
      font-size: 12px;
      padding: 6px 0;
    }
    .security-notice {
      background: rgba(179, 243, 213, 0.03);
      border-left: 3px solid #b3f3d5;
      border-radius: 0 10px 10px 0;
      padding: 14px 18px;
      text-align: left;
      font-size: 12px;
      color: #8d989f;
      line-height: 1.6;
    }
    .security-notice-amber {
      background: rgba(234, 203, 146, 0.05);
      border-left: 3px solid #eacb92;
      border-radius: 0 10px 10px 0;
      padding: 14px 18px;
      text-align: left;
      font-size: 12px;
      color: #8d989f;
      line-height: 1.6;
    }
    .footer {
      padding: 28px 32px 36px;
      text-align: center;
      border-top: 1px solid rgba(224, 243, 241, 0.08);
      font-size: 11px;
      color: #64747c;
      line-height: 1.7;
    }
    .footer-brand {
      margin-bottom: 8px;
    }
    .footer-logo {
      font-weight: 800;
      color: #8d989f;
      letter-spacing: -0.5px;
      font-size: 13px;
    }
    .footer-separator {
      color: #4a5960;
      margin: 0 6px;
    }
    .footer-tagline {
      color: #8d989f;
      font-size: 11px;
    }
    .footer-text {
      margin: 0 0 6px;
    }
    .footer-email {
      color: #b3f3d5;
      text-decoration: none;
    }
  `;
}

function renderBrandHeader(subtitle = 'CINEMA, AHEAD OF THE CURVE'): string {
  return `
    <div class="header" style="padding: 36px 32px 24px; text-align: center; background: linear-gradient(180deg, rgba(179, 243, 213, 0.07) 0%, rgba(18, 23, 28, 0) 100%); border-bottom: 1px solid rgba(224, 243, 241, 0.08);">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table; margin: 0 auto;">
              <tr>
                <td valign="middle" style="padding-right: 10px;">
                  <svg width="28" height="28" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block;">
                    <rect width="64" height="64" rx="18" fill="#14241d"/>
                    <g fill="#b3f3d5" transform="rotate(-12 32 32)">
                      <rect x="15" y="24" width="8" height="24" rx="4"/>
                      <rect x="28" y="12" width="8" height="40" rx="4"/>
                      <rect x="41" y="18" width="8" height="31" rx="4"/>
                    </g>
                  </svg>
                </td>
                <td valign="middle">
                  <span class="brand-text" style="font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 26px; font-weight: 800; letter-spacing: -1.2px; color: #ffffff; line-height: 1;">cinepulse<span class="mint-dot" style="color: #b3f3d5;">.</span></span>
                </td>
              </tr>
            </table>
            <div class="brand-subtitle" style="font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #8d989f; font-weight: 700; margin-top: 8px;">
              ${subtitle}
            </div>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function renderBrandFooter(email: string): string {
  return `
    <div class="footer" style="padding: 28px 32px 36px; text-align: center; border-top: 1px solid rgba(224, 243, 241, 0.08); font-size: 11px; color: #64747c; line-height: 1.7; font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div class="footer-brand" style="margin-bottom: 8px;">
        <span class="footer-logo" style="font-weight: 800; color: #8d989f; letter-spacing: -0.5px; font-size: 13px;">cinepulse<span style="color:#b3f3d5;">.</span></span>
        <span class="footer-separator" style="color: #4a5960; margin: 0 6px;">·</span>
        <span class="footer-tagline" style="color: #8d989f; font-size: 11px;">For the love of what's next.</span>
      </div>
      <p class="footer-text" style="margin: 0 0 6px; color: #64747c;">© ${new Date().getFullYear()} CinePulse Platform. Local-first · Transparent predictions · Real accounts.</p>
      <p class="footer-text" style="margin: 0; color: #64747c;">This automated message was sent to <span class="footer-email" style="color: #b3f3d5; text-decoration: none;">${email}</span>.</p>
    </div>
  `;
}

export function renderOtpEmailHtml(options: { name: string; code: string; email: string; purpose?: 'login' | 'register' | 'delete' }): string {
  const { name, code, purpose } = options;
  const formattedCode = `${code.slice(0, 3)} ${code.slice(3)}`;

  let title = "Verification Code";
  let greeting = `Almost in the front row, ${name || 'film lover'}!`;
  let message = "Welcome to CinePulse. Use your one-time verification code below to confirm your email and step into the premier film journal and prediction community.";
  let badgeLabel = "AUTHENTICATION";

  if (purpose === 'login') {
    title = "Sign-In Code";
    greeting = `Welcome back, ${name || 'film lover'}!`;
    message = "Use your one-time verification code below to sign in to your CinePulse account.";
    badgeLabel = "SIGN-IN VERIFICATION";
  } else if (purpose === 'delete') {
    title = "Account Deletion Code";
    greeting = `Hello ${name || 'film lover'},`;
    message = "You have requested to permanently delete your CinePulse account. Use the one-time verification code below to confirm this action.";
    badgeLabel = "ACCOUNT SECURITY";
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CinePulse ${title}</title>
  <style>
${getEmailStyles()}
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0e12; font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f4f6f5;">
  <div class="wrapper" style="width: 100%; background-color: #0b0e12; padding: 44px 16px;">
    <div class="container" style="max-width: 540px; margin: 0 auto; background-color: #12171c; border: 1px solid rgba(224, 243, 241, 0.11); border-radius: 22px; overflow: hidden; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.75), 0 0 45px rgba(179, 243, 213, 0.05);">
      ${renderBrandHeader('CINEMA, AHEAD OF THE CURVE')}
      <div class="content" style="padding: 36px 32px 28px; text-align: center;">
        <div style="text-align: center; margin-bottom: 16px;">
          <span class="badge-pill" style="display: inline-block; padding: 4px 12px; background: rgba(179, 243, 213, 0.08); border: 1px solid rgba(179, 243, 213, 0.22); border-radius: 999px; font-size: 9px; font-weight: 750; letter-spacing: 1.5px; color: #b3f3d5; text-transform: uppercase;">
            ${badgeLabel}
          </span>
        </div>

        <h2 class="greeting" style="font-size: 24px; font-weight: 700; letter-spacing: -0.5px; color: #f4f6f5; margin: 0 0 12px; line-height: 1.25;">${greeting}</h2>
        <p class="message" style="font-size: 14px; line-height: 1.65; color: #8d989f; margin: 0 0 28px;">
          ${message}
        </p>

        <div class="otp-card" style="background-color: #0e1418; border: 1px solid rgba(179, 243, 213, 0.26); border-radius: 18px; padding: 24px 20px; margin: 0 auto 28px; box-shadow: inset 0 0 30px rgba(179, 243, 213, 0.04), 0 10px 25px rgba(0, 0, 0, 0.4); text-align: center;">
          <div class="otp-label" style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #8d989f; margin-bottom: 10px;">
            ONE-TIME ${title.toUpperCase()}
          </div>
          <div class="otp-digits" style="font-family: 'SF Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace; font-size: 40px; font-weight: 800; letter-spacing: 10px; color: #b3f3d5; text-shadow: 0 0 25px rgba(179, 243, 213, 0.45); margin: 0; padding-left: 10px;">
            ${formattedCode}
          </div>
          <div style="margin-top: 14px;">
            <span class="expiry-tag" style="display: inline-block; padding: 5px 14px; background: rgba(234, 203, 146, 0.12); border: 1px solid rgba(234, 203, 146, 0.3); border-radius: 999px; font-size: 11px; font-weight: 600; color: #eacb92;">
              ⏱ Valid for 10 minutes
            </span>
          </div>
        </div>

        <div class="security-notice" style="background: rgba(179, 243, 213, 0.03); border-left: 3px solid #b3f3d5; border-radius: 0 10px 10px 0; padding: 14px 18px; text-align: left; font-size: 12px; color: #8d989f; line-height: 1.6;">
          <strong style="color: #f4f6f5;">Security Notice:</strong> If you did not initiate this request on CinePulse, you can safely disregard this email. CinePulse never asks for this code over phone, email, or chat.
        </div>
      </div>
      ${renderBrandFooter(options.email)}
    </div>
  </div>
</body>
</html>`;
}

export function renderWelcomeEmailHtml(options: { name: string; email: string }): string {
  const { name } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to CinePulse</title>
  <style>
${getEmailStyles()}
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0e12; font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f4f6f5;">
  <div class="wrapper" style="width: 100%; background-color: #0b0e12; padding: 44px 16px;">
    <div class="container" style="max-width: 540px; margin: 0 auto; background-color: #12171c; border: 1px solid rgba(224, 243, 241, 0.11); border-radius: 22px; overflow: hidden; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.75), 0 0 45px rgba(179, 243, 213, 0.05);">
      ${renderBrandHeader('CINEMA, AHEAD OF THE CURVE')}
      <div class="content" style="padding: 36px 32px 28px; text-align: center;">
        <div style="text-align: center; margin-bottom: 16px;">
          <span class="badge-pill" style="display: inline-block; padding: 4px 12px; background: rgba(179, 243, 213, 0.08); border: 1px solid rgba(179, 243, 213, 0.22); border-radius: 999px; font-size: 9px; font-weight: 750; letter-spacing: 1.5px; color: #b3f3d5; text-transform: uppercase;">
            WELCOME TO CINEPULSE
          </span>
        </div>

        <h2 class="greeting" style="font-size: 26px; font-weight: 700; letter-spacing: -0.5px; color: #f4f6f5; margin: 0 0 14px; line-height: 1.25;">
          Welcome to the front row, ${name || 'film lover'}!
        </h2>
        <p class="message" style="font-size: 14px; line-height: 1.7; color: #8d989f; margin: 0 0 26px;">
          Your CinePulse account is officially active. You're now connected to a premier platform where cinema meets community predictions, transparent ratings, and curated film journals.
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 30px;">
          <tr>
            <td align="center" style="border-radius: 12px; background-color: #b3f3d5;">
              <a href="${readEnv('APP_ORIGIN') || 'http://127.0.0.1:3000'}" target="_blank" class="btn-primary" style="font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; font-weight: 700; color: #12291e !important; text-decoration: none; padding: 14px 34px; display: inline-block; border-radius: 12px; letter-spacing: 0.2px;">
                Explore CinePulse &rarr;
              </a>
            </td>
          </tr>
        </table>

        <div class="highlight-card" style="background: rgba(179, 243, 213, 0.04); border: 1px solid rgba(179, 243, 213, 0.14); border-radius: 16px; padding: 20px; text-align: left; margin: 0 0 26px;">
          <div class="highlight-eyebrow" style="font-size: 9px; font-weight: 750; letter-spacing: 1.5px; text-transform: uppercase; color: #b3f3d5; margin-bottom: 6px;">
            THE OPENING CALL · COMMUNITY PREDICTIONS
          </div>
          <div class="highlight-title" style="font-size: 15px; font-weight: 700; color: #f4f6f5; margin-bottom: 6px;">
            The next big thing? You tell us.
          </div>
          <div class="highlight-body" style="font-size: 12px; color: #8d989f; line-height: 1.6;">
            Cast your box-office forecasts, vote on upcoming releases, and build your reputation on the community leaderboard.
          </div>
        </div>

        <div class="security-notice" style="background: rgba(179, 243, 213, 0.03); border-left: 3px solid #b3f3d5; border-radius: 0 10px 10px 0; padding: 14px 18px; text-align: left; font-size: 12px; color: #8d989f; line-height: 1.6;">
          <strong style="color: #f4f6f5;">Pro-tip:</strong> Search any movie or series to add it to your personal watchlist or record private ratings.
        </div>
      </div>
      ${renderBrandFooter(options.email)}
    </div>
  </div>
</body>
</html>`;
}

export async function sendOtpEmail(options: OtpEmailOptions): Promise<{ success: boolean; devMode: boolean; notice?: string }> {
  const { to, name, code, purpose } = options;
  const subject = purpose === 'delete' 
    ? `CinePulse · ${code} is your account deletion code`
    : `CinePulse · ${code} is your ${purpose === 'login' ? 'sign-in' : 'verification'} code`;
  const html = renderOtpEmailHtml({ name, code, email: to, purpose });

  // Store in memory for dev inspection
  latestDevEmail = {
    to,
    name,
    code,
    subject,
    html,
    sentAt: new Date().toISOString(),
  };

  const host = readEnv('SMTP_HOST');
  const user = readEnv('SMTP_USER');
  const pass = readEnv('SMTP_PASS');

  if (host && user && pass) {
    try {
      const port = Number(readEnv('SMTP_PORT') || 465);
      const secure = port === 465;
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });

      await transporter.sendMail({
        from: readEnv('SMTP_FROM') || `"CinePulse" <${user}>`,
        to,
        subject,
        html,
      });

      console.log(`[CINEPULSE MAILER] Successfully delivered OTP email to ${to} via SMTP (${host})`);
      return { success: true, devMode: false };
    } catch (smtpError) {
      console.error('[CINEPULSE MAILER] SMTP send failed:', (smtpError as Error).message);
    }
  }

  const resendKey = readEnv('RESEND_API_KEY');
  let notice: string | undefined;

  if (resendKey) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: readEnv('EMAIL_FROM') || 'CinePulse <onboarding@resend.dev>',
          to: [to],
          subject,
          html,
        }),
      });
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        console.log(`[CINEPULSE MAILER] Successfully delivered OTP email to ${to} via Resend API (id: ${data.id || 'ok'})`);
        return { success: true, devMode: false };
      } else {
        let errMessage = '';
        try {
          const errJson = await resp.json();
          errMessage = errJson.message || '';
        } catch {
          errMessage = await resp.text();
        }
        console.warn(`[CINEPULSE MAILER] Resend notice for ${to}:`, errMessage);
        notice = errMessage;
      }
    } catch (resendError) {
      console.error('[CINEPULSE MAILER] Resend send failed:', (resendError as Error).message);
    }
  }

  // Development output in terminal
  console.log('\n============================================================');
  console.log('🎬 CINEPULSE DEV MAILER — OTP VERIFICATION CODE');
  console.log('------------------------------------------------------------');
  console.log(`To:       ${to} (${name || 'New Member'})`);
  console.log(`Code:     >>>  ${code}  <<<`);
  console.log('Expires:  10 minutes');
  console.log('Preview:  http://127.0.0.1:3000/api/auth/otp/preview');
  console.log('============================================================\n');

  return { success: true, devMode: true, notice };
}

export async function sendWelcomeEmail(options: { to: string; name: string }): Promise<{ success: boolean; notice?: string }> {
  const { to, name } = options;
  const subject = `CinePulse · Welcome to the front row, ${name}!`;
  const html = renderWelcomeEmailHtml({ name, email: to });

  const host = readEnv('SMTP_HOST');
  const user = readEnv('SMTP_USER');
  const pass = readEnv('SMTP_PASS');

  if (host && user && pass) {
    try {
      const port = Number(readEnv('SMTP_PORT') || 465);
      const secure = port === 465;
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });

      await transporter.sendMail({
        from: readEnv('SMTP_FROM') || `"CinePulse" <${user}>`,
        to,
        subject,
        html,
      });

      console.log(`[CINEPULSE MAILER] Successfully delivered Welcome email to ${to} via SMTP`);
      return { success: true };
    } catch (smtpError) {
      console.error('[CINEPULSE MAILER] SMTP send failed:', (smtpError as Error).message);
    }
  }

  const resendKey = readEnv('RESEND_API_KEY');
  let notice: string | undefined;

  if (resendKey) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: readEnv('EMAIL_FROM') || 'CinePulse <onboarding@resend.dev>',
          to: [to],
          subject,
          html,
        }),
      });
      if (resp.ok) {
        console.log(`[CINEPULSE MAILER] Successfully delivered Welcome email to ${to} via Resend API`);
        return { success: true };
      } else {
        const errMessage = await resp.text();
        notice = errMessage;
      }
    } catch (resendError) {
      console.error('[CINEPULSE MAILER] Resend send failed:', (resendError as Error).message);
    }
  }

  return { success: true, notice };
}

export function renderLoginNotificationEmailHtml(options: { name: string; email: string; time: string }): string {
  const { name, time } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Login to CinePulse</title>
  <style>
${getEmailStyles()}
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0e12; font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f4f6f5;">
  <div class="wrapper" style="width: 100%; background-color: #0b0e12; padding: 44px 16px;">
    <div class="container" style="max-width: 540px; margin: 0 auto; background-color: #12171c; border: 1px solid rgba(224, 243, 241, 0.11); border-radius: 22px; overflow: hidden; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.75), 0 0 45px rgba(179, 243, 213, 0.05);">
      ${renderBrandHeader('CINEMA, AHEAD OF THE CURVE')}
      <div class="content" style="padding: 36px 32px 28px; text-align: center;">
        <div style="text-align: center; margin-bottom: 16px;">
          <span class="badge-pill" style="display: inline-block; padding: 4px 12px; background: rgba(179, 243, 213, 0.08); border: 1px solid rgba(179, 243, 213, 0.22); border-radius: 999px; font-size: 9px; font-weight: 750; letter-spacing: 1.5px; color: #b3f3d5; text-transform: uppercase;">
            SECURITY NOTIFICATION
          </span>
        </div>

        <h2 class="greeting" style="font-size: 24px; font-weight: 700; letter-spacing: -0.5px; color: #f4f6f5; margin: 0 0 12px; line-height: 1.25;">
          New sign-in detected
        </h2>
        <p class="message" style="font-size: 14px; line-height: 1.65; color: #8d989f; margin: 0 0 24px;">
          Hi ${name || 'film lover'}, a new login session was established on your CinePulse account. If this was you, no action is needed.
        </p>

        <div style="background: #0e1418; border: 1px solid rgba(224, 243, 241, 0.09); border-radius: 16px; padding: 18px 22px; margin: 0 auto 24px; text-align: left;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px;">
            <tr>
              <td style="padding: 7px 0; color: #8d989f; font-weight: 600; width: 90px;">Account</td>
              <td style="padding: 7px 0; color: #f4f6f5; font-family: 'SF Mono', 'Fira Code', Menlo, Consolas, monospace; font-size: 12px;">${options.email}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #8d989f; font-weight: 600;">Time</td>
              <td style="padding: 7px 0; color: #f4f6f5; font-family: 'SF Mono', 'Fira Code', Menlo, Consolas, monospace; font-size: 12px;">${time}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #8d989f; font-weight: 600;">Status</td>
              <td style="padding: 7px 0; color: #b3f3d5; font-weight: 700; font-size: 12px;">● Authorized Session</td>
            </tr>
          </table>
        </div>

        <div class="security-notice-amber" style="background: rgba(234, 203, 146, 0.05); border-left: 3px solid #eacb92; border-radius: 0 10px 10px 0; padding: 14px 18px; text-align: left; font-size: 12px; color: #8d989f; line-height: 1.6;">
          <strong style="color: #eacb92;">Didn't sign in?</strong> If you did not initiate this login, please secure your account immediately by changing your password or contacting support.
        </div>
      </div>
      ${renderBrandFooter(options.email)}
    </div>
  </div>
</body>
</html>`;
}

export async function sendLoginNotificationEmail(options: { to: string; name: string; time: string }): Promise<{ success: boolean; notice?: string }> {
  const { to, name, time } = options;
  const subject = `CinePulse · Security Alert: New sign-in detected`;
  const html = renderLoginNotificationEmailHtml({ name, email: to, time });

  const host = readEnv('SMTP_HOST');
  const user = readEnv('SMTP_USER');
  const pass = readEnv('SMTP_PASS');

  if (host && user && pass) {
    try {
      const port = Number(readEnv('SMTP_PORT') || 465);
      const secure = port === 465;
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });

      await transporter.sendMail({
        from: readEnv('SMTP_FROM') || `"CinePulse" <${user}>`,
        to,
        subject,
        html,
      });

      console.log(`[CINEPULSE MAILER] Successfully delivered Login Notification email to ${to} via SMTP`);
      return { success: true };
    } catch (smtpError) {
      console.error('[CINEPULSE MAILER] SMTP send failed:', (smtpError as Error).message);
    }
  }

  const resendKey = readEnv('RESEND_API_KEY');
  let notice: string | undefined;

  if (resendKey) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: readEnv('EMAIL_FROM') || 'CinePulse <onboarding@resend.dev>',
          to: [to],
          subject,
          html,
        }),
      });
      if (resp.ok) {
        console.log(`[CINEPULSE MAILER] Successfully delivered Login Notification email to ${to} via Resend API`);
        return { success: true };
      } else {
        const errMessage = await resp.text();
        notice = errMessage;
      }
    } catch (resendError) {
      console.error('[CINEPULSE MAILER] Resend send failed:', (resendError as Error).message);
    }
  }

  return { success: true, notice };
}

