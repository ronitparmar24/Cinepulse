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

export function renderOtpEmailHtml(options: { name: string; code: string; email: string; purpose?: 'login' | 'register' | 'delete' }): string {
  const { name, code, purpose } = options;
  const formattedCode = `${code.slice(0, 3)} ${code.slice(3)}`;

  let title = "Verification Code";
  let greeting = `Almost in the front row, ${name || 'film lover'}!`;
  let message = "Welcome to CinePulse. Use your one-time verification code below to confirm your email and step into the premier film journal and prediction community.";

  if (purpose === 'login') {
    title = "Sign-In Code";
    greeting = `Welcome back, ${name || 'film lover'}!`;
    message = "Use your one-time verification code below to sign in to your CinePulse account.";
  } else if (purpose === 'delete') {
    title = "Account Deletion Code";
    greeting = `Hello ${name || 'film lover'},`;
    message = "You have requested to permanently delete your CinePulse account. Use the one-time verification code below to confirm this action.";
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CinePulse ${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #07090e;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #07090e;
      padding: 40px 16px;
    }
    .container {
      max-width: 540px;
      margin: 0 auto;
      background: linear-gradient(180deg, #0f172a 0%, #0b1120 100%);
      border: 1px solid #1e293b;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 40px rgba(56, 189, 248, 0.1);
    }
    .header {
      padding: 32px 32px 24px;
      text-align: center;
      background: linear-gradient(180deg, rgba(56, 189, 248, 0.08) 0%, transparent 100%);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
    }
    .logo-badge {
      display: inline-block;
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: linear-gradient(135deg, #38bdf8 0%, #6366f1 100%);
      line-height: 38px;
      text-align: center;
      font-size: 20px;
      box-shadow: 0 0 15px rgba(56, 189, 248, 0.5);
    }
    .brand-title {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #ffffff;
      margin: 0;
    }
    .brand-subtitle {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #38bdf8;
      font-weight: 700;
      margin-top: 4px;
    }
    .content {
      padding: 36px 32px;
      text-align: center;
    }
    .greeting {
      font-size: 20px;
      font-weight: 700;
      color: #f8fafc;
      margin: 0 0 12px;
    }
    .message {
      font-size: 15px;
      line-height: 1.6;
      color: #94a3b8;
      margin: 0 0 28px;
    }
    .otp-card {
      background: #070a13;
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 16px;
      padding: 24px 20px;
      margin: 0 auto 28px;
      box-shadow: inset 0 0 25px rgba(56, 189, 248, 0.08), 0 8px 20px rgba(0, 0, 0, 0.4);
    }
    .otp-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #64748b;
      margin-bottom: 8px;
    }
    .otp-digits {
      font-family: 'SF Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace;
      font-size: 38px;
      font-weight: 800;
      letter-spacing: 10px;
      color: #38bdf8;
      text-shadow: 0 0 20px rgba(56, 189, 248, 0.5);
      margin: 0;
      padding-left: 10px;
    }
    .expiry-tag {
      display: inline-block;
      margin-top: 10px;
      padding: 4px 12px;
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.25);
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      color: #fbbf24;
    }
    .features-strip {
      display: flex;
      justify-content: space-around;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      padding: 16px 0;
      margin: 0 0 28px;
      text-align: center;
    }
    .feature-item {
      font-size: 12px;
      color: #cbd5e1;
      font-weight: 500;
    }
    .security-notice {
      background: rgba(15, 23, 42, 0.6);
      border-left: 3px solid #6366f1;
      border-radius: 0 8px 8px 0;
      padding: 12px 16px;
      text-align: left;
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.5;
    }
    .footer {
      padding: 24px 32px 32px;
      text-align: center;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 12px;
      color: #64748b;
      line-height: 1.6;
    }
    .footer a {
      color: #38bdf8;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="brand">
          <span class="logo-badge">🎬</span>
          <div style="text-align: left;">
            <h1 class="brand-title">CinePulse</h1>
            <div class="brand-subtitle">Cinema, ahead of the curve</div>
          </div>
        </div>
      </div>
      <div class="content">
        <h2 class="greeting">${greeting}</h2>
        <p class="message">
          ${message}
        </p>

        <div class="otp-card">
          <div class="otp-label">One-Time ${title}</div>
          <div class="otp-digits">${formattedCode}</div>
          <div class="expiry-tag">⏱ Valid for 10 minutes</div>
        </div>

        <div class="security-notice">
          <strong>Security Notice:</strong> If you did not initiate this request on CinePulse, you can safely disregard this email. CinePulse never asks for this code over phone or chat.
        </div>
      </div>
      <div class="footer">
        <p>© ${new Date().getFullYear()} CinePulse Platform. All rights reserved.</p>
        <p>This automated message was sent to <span style="color: #cbd5e1;">${options.email}</span>.</p>
      </div>
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
    body {
      margin: 0;
      padding: 0;
      background-color: #07090e;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #07090e;
      padding: 40px 16px;
    }
    .container {
      max-width: 540px;
      margin: 0 auto;
      background: linear-gradient(180deg, #0f172a 0%, #0b1120 100%);
      border: 1px solid #1e293b;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 40px rgba(56, 189, 248, 0.1);
    }
    .header {
      padding: 32px 32px 24px;
      text-align: center;
      background: linear-gradient(180deg, rgba(56, 189, 248, 0.08) 0%, transparent 100%);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
    }
    .logo-badge {
      display: inline-block;
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: linear-gradient(135deg, #38bdf8 0%, #6366f1 100%);
      line-height: 38px;
      text-align: center;
      font-size: 20px;
      box-shadow: 0 0 15px rgba(56, 189, 248, 0.5);
    }
    .brand-title {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #ffffff;
      margin: 0;
    }
    .brand-subtitle {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #38bdf8;
      font-weight: 700;
      margin-top: 4px;
    }
    .content {
      padding: 36px 32px;
      text-align: center;
    }
    .greeting {
      font-size: 20px;
      font-weight: 700;
      color: #f8fafc;
      margin: 0 0 12px;
    }
    .message {
      font-size: 15px;
      line-height: 1.6;
      color: #94a3b8;
      margin: 0 0 28px;
    }
    .btn {
      display: inline-block;
      padding: 14px 32px;
      background: linear-gradient(135deg, #38bdf8 0%, #6366f1 100%);
      color: #fff;
      text-decoration: none;
      font-weight: 700;
      border-radius: 99px;
      font-size: 15px;
      box-shadow: 0 8px 20px rgba(56, 189, 248, 0.3);
      margin-bottom: 32px;
    }
    .security-notice {
      background: rgba(15, 23, 42, 0.6);
      border-left: 3px solid #38bdf8;
      border-radius: 0 8px 8px 0;
      padding: 12px 16px;
      text-align: left;
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.5;
    }
    .footer {
      padding: 24px 32px 32px;
      text-align: center;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 12px;
      color: #64748b;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="brand">
          <span class="logo-badge">🎬</span>
          <div style="text-align: left;">
            <h1 class="brand-title">CinePulse</h1>
            <div class="brand-subtitle">Cinema, ahead of the curve</div>
          </div>
        </div>
      </div>
      <div class="content">
        <h2 class="greeting">Welcome to the club, ${name || 'film lover'}!</h2>
        <p class="message">
          Your CinePulse account is officially active. You're now part of a community where cinema meets prediction and curation. Start exploring films, casting your forecasts, and building your personal library.
        </p>

        <a href="${readEnv('APP_ORIGIN') || 'http://127.0.0.1:3000'}" class="btn">
          Explore CinePulse
        </a>

        <div class="security-notice">
          <strong>Tip:</strong> Head over to the Prediction Hub to cast your first vote and climb the leaderboard!
        </div>
      </div>
      <div class="footer">
        <p>© ${new Date().getFullYear()} CinePulse Platform. All rights reserved.</p>
        <p>This automated message was sent to <span style="color: #cbd5e1;">${options.email}</span>.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function sendOtpEmail(options: OtpEmailOptions): Promise<{ success: boolean; devMode: boolean; notice?: string }> {
  const { to, name, code, purpose } = options;
  const subject = purpose === 'delete' 
    ? `🎬 ${code} is your CinePulse account deletion code`
    : `🎬 ${code} is your CinePulse ${purpose === 'login' ? 'sign-in' : 'verification'} code`;
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
  const subject = `🎬 Welcome to CinePulse, ${name}!`;
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
    body {
      margin: 0;
      padding: 0;
      background-color: #07090e;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #07090e;
      padding: 40px 16px;
    }
    .container {
      max-width: 540px;
      margin: 0 auto;
      background: linear-gradient(180deg, #0f172a 0%, #0b1120 100%);
      border: 1px solid #1e293b;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 40px rgba(56, 189, 248, 0.1);
    }
    .header {
      padding: 32px 32px 24px;
      text-align: center;
      background: linear-gradient(180deg, rgba(56, 189, 248, 0.08) 0%, transparent 100%);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
    }
    .logo-badge {
      display: inline-block;
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: linear-gradient(135deg, #38bdf8 0%, #6366f1 100%);
      line-height: 38px;
      text-align: center;
      font-size: 20px;
      box-shadow: 0 0 15px rgba(56, 189, 248, 0.5);
    }
    .brand-title {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #ffffff;
      margin: 0;
    }
    .brand-subtitle {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #38bdf8;
      font-weight: 700;
      margin-top: 4px;
    }
    .content {
      padding: 36px 32px;
      text-align: center;
    }
    .greeting {
      font-size: 20px;
      font-weight: 700;
      color: #f8fafc;
      margin: 0 0 12px;
    }
    .message {
      font-size: 15px;
      line-height: 1.6;
      color: #94a3b8;
      margin: 0 0 28px;
    }
    .info-card {
      background: #070a13;
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 16px;
      padding: 24px 20px;
      margin: 0 auto 28px;
      box-shadow: inset 0 0 25px rgba(56, 189, 248, 0.08), 0 8px 20px rgba(0, 0, 0, 0.4);
      text-align: left;
    }
    .info-row {
      margin-bottom: 12px;
      font-size: 14px;
    }
    .info-row:last-child {
      margin-bottom: 0;
    }
    .info-label {
      color: #64748b;
      font-weight: 600;
      display: inline-block;
      width: 80px;
    }
    .info-value {
      color: #e2e8f0;
      font-family: 'SF Mono', 'Fira Code', monospace;
    }
    .security-notice {
      background: rgba(15, 23, 42, 0.6);
      border-left: 3px solid #f59e0b;
      border-radius: 0 8px 8px 0;
      padding: 12px 16px;
      text-align: left;
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.5;
    }
    .footer {
      padding: 24px 32px 32px;
      text-align: center;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 12px;
      color: #64748b;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="brand">
          <span class="logo-badge">🎬</span>
          <div style="text-align: left;">
            <h1 class="brand-title">CinePulse</h1>
            <div class="brand-subtitle">Security Alert</div>
          </div>
        </div>
      </div>
      <div class="content">
        <h2 class="greeting">New sign-in detected</h2>
        <p class="message">
          Hi ${name || 'film lover'}, we noticed a new login to your CinePulse account. If this was you, no action is needed.
        </p>

        <div class="info-card">
          <div class="info-row">
            <span class="info-label">Account</span>
            <span class="info-value">${options.email}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Time</span>
            <span class="info-value">${time}</span>
          </div>
        </div>

        <div class="security-notice">
          <strong>Didn't do this?</strong> Please secure your account by changing your password or contacting support.
        </div>
      </div>
      <div class="footer">
        <p>© ${new Date().getFullYear()} CinePulse Platform. All rights reserved.</p>
        <p>This automated security message was sent to <span style="color: #cbd5e1;">${options.email}</span>.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function sendLoginNotificationEmail(options: { to: string; name: string; time: string }): Promise<{ success: boolean; notice?: string }> {
  const { to, name, time } = options;
  const subject = \`🎬 Security Alert: New sign-in to CinePulse\`;
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
        from: readEnv('SMTP_FROM') || \`"CinePulse" <\${user}>\`,
        to,
        subject,
        html,
      });

      console.log(\`[CINEPULSE MAILER] Successfully delivered Login Notification email to \${to} via SMTP\`);
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
          'Authorization': \`Bearer \${resendKey}\`,
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
        console.log(\`[CINEPULSE MAILER] Successfully delivered Login Notification email to \${to} via Resend API\`);
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
