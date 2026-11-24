/**
 * /api/auth, /api/account, /api/export, /api/analytics
 * Moved verbatim from the former catch-all route; returns null when no branch matches.
 */

import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { logEvent } from '../../analytics';
import {
  clearOAuthStateCookie,
  clearSessionCookie,
  createSession,
  currentUser,
  deleteAccountWithOtp,
  demoGoogleLogin,
  exchangeGoogleCode,
  exportAccount,
  getGoogleOAuthUrl,
  isGoogleConfigured,
  login,
  loginOrRegisterGoogleUser,
  logout,
  oauthOrigin,
  oauthStateCookie,
  register,
  renewRememberedSession,
  shortenSession,
  requestDeleteOtp,
  requestEmailOtp,
  requestGoogleOtp,
  requireUser,
  resendEmailOtp,
  secureCookie,
  sessionCookie,
  syncSupabaseUserToLocal,
  tokenFromRequest,
  verifyEmailOtp,
  verifyGoogleOtp,
} from '../../auth';
import { devAuthAllowed } from '../../auth/devAuth';
import { checkLoginRateLimit, getClientIp, resetLoginRateLimit } from '../../auth/rateLimit';
import { enforceTurnstile } from '../../auth/turnstile';
import { bad, notFound, unauthorized } from '../../errors';
import { getLatestDevEmail, sendLoginNotificationEmail } from '../../mailer';
import { isSupabaseConfigured, supabaseAdmin } from '../../supabase';
import type { User } from '../../types';
import type { ApiContext } from '../http';
import { body, json } from '../http';

/** Only same-site relative paths may be used as a post-sign-in destination. */
function safeReturnPath(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\') || value.startsWith('/api/')) return '/';
  return value.slice(0, 512);
}

/** Builds the redirect back into the app with ?auth_success / ?auth_error added. */
function returnRedirect(request: Request, returnTo: string, key: 'auth_success' | 'auth_error', value: string): NextResponse {
  const url = new URL(safeReturnPath(returnTo), oauthOrigin(request));
  url.searchParams.delete('auth_success');
  url.searchParams.delete('auth_error');
  url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

/** The OAuth state cookie carries the CSRF nonce plus the user's choices for this sign-in. */
function packOAuthState(nonce: string, remember: boolean, returnTo: string): string {
  return encodeURIComponent(`${nonce}|${remember ? '1' : '0'}|${returnTo}`);
}
function unpackOAuthState(raw: string | null): { nonce: string; remember: boolean; returnTo: string } | null {
  if (!raw) return null;
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { return null; }
  const [nonce, remember, ...rest] = decoded.split('|');
  if (!nonce) return null;
  return { nonce, remember: remember !== '0', returnTo: safeReturnPath(rest.join('|') || '/') };
}

/** Applies "remember this device" to a just-created session. */
async function sessionCookieFor(request: Request, token: string, remember: boolean): Promise<string> {
  if (!remember) await shortenSession(token);
  return sessionCookie(token, secureCookie(request), remember);
}
function wantsRemember(reqBody: unknown): boolean {
  return !(reqBody && typeof reqBody === 'object' && (reqBody as Record<string, unknown>).remember === false);
}

export async function handleAuth({ request, parts, method, query }: ApiContext): Promise<Response | null> {
  if (parts[0] === 'auth' && parts[1] === 'me' && method === 'GET') {
    // The session token stays in its HttpOnly cookie; it is never handed to page scripts.
    const user = await currentUser(request);
    const response = json({ user });
    if (user) {
      const renewed = await renewRememberedSession(request);
      if (renewed) response.headers.append('Set-Cookie', sessionCookie(renewed, secureCookie(request), true));
    }
    return response;
  }

  if (parts[0] === 'auth' && parts[1] === 'config' && method === 'GET')
    return json({
      googleAuth: isGoogleConfigured(),
      // Tells the site owner (local development only) that the Google button needs credentials.
      googleSetupNeeded: !isGoogleConfigured() && devAuthAllowed(),
      supabaseAuth: false,
    });

  if (parts[0] === 'auth' && parts[1] === 'google' && parts.length === 2 && method === 'GET') {
    const demo = query.get('demo');
    if (demo === '1' && devAuthAllowed()) {
      const result = await demoGoogleLogin(query.get('email') || undefined, query.get('name') || undefined);
      const res = NextResponse.redirect(new URL('/?auth_success=google', request.url));
      res.headers.append('Set-Cookie', sessionCookie(result.token, secureCookie(request)));
      return res;
    }
    const returnTo = safeReturnPath(query.get('returnTo'));
    if (isGoogleConfigured()) {
      const nonce = randomBytes(16).toString('hex');
      const url = getGoogleOAuthUrl(request, nonce, query.get('login_hint'));
      const res = NextResponse.redirect(url);
      res.headers.append('Set-Cookie', oauthStateCookie(packOAuthState(nonce, query.get('remember') !== '0', returnTo), secureCookie(request)));
      return res;
    }
    // No credentials: never fake a Google account. The dialog explains the setup instead.
    return returnRedirect(request, returnTo, 'auth_error', 'Google sign-in is not set up on this server yet');
  }

  if (parts[0] === 'auth' && parts[1] === 'google' && parts[2] === 'callback' && method === 'GET') {
    const code = query.get('code');
    const state = query.get('state');
    const error = query.get('error');
    const cookieHeader = request.headers.get('cookie') || '';
    const match = cookieHeader.match(/(?:^|;\s*)cinepulse_oauth_state=([^;]+)/);
    const saved = unpackOAuthState(match ? match[1] : null);
    const returnTo = saved?.returnTo || '/';
    const fail = (message: string) => {
      const res = returnRedirect(request, returnTo, 'auth_error', message);
      res.headers.append('Set-Cookie', clearOAuthStateCookie(secureCookie(request)));
      return res;
    };
    if (error) return fail(error === 'access_denied' ? 'Google sign-in was cancelled' : 'Google sign-in failed. Please try again.');
    if (!code) return fail('Google did not return an authorization code. Please try again.');
    if (!state || !saved || state !== saved.nonce) return fail('That Google sign-in link expired. Please try again.');
    try {
      const profile = await exchangeGoogleCode(request, code);
      const result = await loginOrRegisterGoogleUser(profile);
      const res = returnRedirect(request, returnTo, 'auth_success', result.isNew ? 'google_new' : 'google');
      res.headers.append('Set-Cookie', await sessionCookieFor(request, result.token, saved.remember));
      res.headers.append('Set-Cookie', clearOAuthStateCookie(secureCookie(request)));
      return res;
    } catch (err) {
      return fail((err as Error).message || 'Google sign-in failed. Please try again.');
    }
  }

  if (parts[0] === 'auth' && parts[1] === 'google' && parts[2] === 'demo' && method === 'POST') {
    if (!devAuthAllowed()) throw notFound();
    const reqBody = (await body(request).catch(() => ({}))) as Record<string, unknown>;
    const result = await demoGoogleLogin(
      typeof reqBody.email === 'string' ? reqBody.email : undefined,
      typeof reqBody.name === 'string' ? reqBody.name : undefined,
    );
    const response = json({ user: result.user });
    response.headers.append('Set-Cookie', sessionCookie(result.token, secureCookie(request)));
    return response;
  }

  if (parts[0] === 'auth' && parts[1] === 'google' && parts[2] === 'otp' && parts[3] === 'request' && method === 'POST') {
    if (!devAuthAllowed()) throw notFound();
    const ip = getClientIp(request);
    await checkLoginRateLimit(ip, 'auth_google_otp_request');
    const result = await requestGoogleOtp(await body(request));
    return json(result);
  }

  if (parts[0] === 'auth' && parts[1] === 'google' && parts[2] === 'otp' && parts[3] === 'verify' && method === 'POST') {
    if (!devAuthAllowed()) throw notFound();
    const ip = getClientIp(request);
    await checkLoginRateLimit(ip, 'auth_google_otp_verify');
    const result = await verifyGoogleOtp(await body(request));
    await resetLoginRateLimit(ip, 'auth_google_otp_verify');
    await resetLoginRateLimit(ip, 'auth_login');
    const response = json({ user: result.user, welcome: true });
    response.headers.append('Set-Cookie', sessionCookie(result.token, secureCookie(request)));
    return response;
  }

  if (parts[0] === 'auth' && parts[1] === 'session' && method === 'POST') {
    const reqBody = (await body(request).catch(() => ({}))) as Record<string, unknown>;
    const accessToken = typeof reqBody.access_token === 'string' ? reqBody.access_token : '';
    if (!accessToken) throw bad('access_token is required');

    if (isSupabaseConfigured()) {
      const admin = supabaseAdmin();
      if (admin) {
        const {
          data: { user: sbUser },
          error,
        } = await admin.auth.getUser(accessToken);
        if (error || !sbUser) throw unauthorized(error?.message || 'Invalid Supabase session');

        const meta = sbUser.user_metadata || {};
        const isGoogle = sbUser.app_metadata?.provider === 'google' || sbUser.identities?.some((i) => i.provider === 'google');
        const appUser: User = {
          id: sbUser.id,
          name: (meta.name || meta.full_name || sbUser.email?.split('@')[0] || 'Film Lover').slice(0, 80),
          email: (sbUser.email || '').toLowerCase().trim(),
          createdAt: sbUser.created_at,
          isGoogle: Boolean(isGoogle),
        };

        await syncSupabaseUserToLocal(appUser);
        const token = await createSession(appUser.id);
        try {
          await sendLoginNotificationEmail({
            to: appUser.email,
            name: appUser.name,
            time: new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST',
          });
        } catch (mailErr) {
          console.error('[AUTH SESSION] Failed to send login notification:', mailErr);
        }
        const response = json({ user: appUser, token });
        response.headers.append('Set-Cookie', sessionCookie(token, secureCookie(request)));
        return response;
      }
    }
    throw bad('Supabase is not configured');
  }

  if (parts[0] === 'auth' && parts[1] === 'otp' && parts[2] === 'request' && method === 'POST') {
    const ip = getClientIp(request);
    await checkLoginRateLimit(ip, 'auth_otp_request');
    const reqBody = await body(request);
    await enforceTurnstile(request, reqBody, ip);
    const result = await requestEmailOtp(reqBody);
    return json(result);
  }

  if (parts[0] === 'auth' && parts[1] === 'otp' && parts[2] === 'verify' && method === 'POST') {
    const ip = getClientIp(request);
    await checkLoginRateLimit(ip, 'auth_otp_verify');
    const reqBody = await body(request);
    const result = await verifyEmailOtp(reqBody);
    await resetLoginRateLimit(ip, 'auth_otp_verify');
    await resetLoginRateLimit(ip, 'auth_login');
    const response = json({ user: result.user, welcome: true });
    response.headers.append('Set-Cookie', await sessionCookieFor(request, result.token, wantsRemember(reqBody)));
    return response;
  }

  if (parts[0] === 'auth' && parts[1] === 'otp' && parts[2] === 'resend' && method === 'POST') {
    const ip = getClientIp(request);
    await checkLoginRateLimit(ip, 'auth_otp_resend');
    const result = await resendEmailOtp(await body(request));
    return json(result);
  }

  if (parts[0] === 'auth' && parts[1] === 'otp' && parts[2] === 'preview' && method === 'GET') {
    if (!devAuthAllowed()) throw notFound();
    const preview = getLatestDevEmail();
    if (!preview) return json({ message: 'No OTP emails have been sent yet in this session.' });
    if (request.headers.get('accept')?.includes('text/html') || query.get('format') === 'html') {
      return new NextResponse(preview.html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    return json(preview);
  }

  if (parts[0] === 'auth' && parts[1] === 'register' && method === 'POST') {
    const reqBody = await body(request);
    await enforceTurnstile(request, reqBody, getClientIp(request));
    const result = await register(reqBody);
    const response = json({ user: result.user });
    response.headers.append('Set-Cookie', await sessionCookieFor(request, result.token, wantsRemember(reqBody)));
    return response;
  }

  if (parts[0] === 'auth' && parts[1] === 'login' && method === 'POST') {
    const ip = getClientIp(request);
    await checkLoginRateLimit(ip, 'auth_login');
    const reqBody = await body(request);
    await enforceTurnstile(request, reqBody, ip);
    const result = await login(reqBody, request);
    await resetLoginRateLimit(ip, 'auth_login');
    const response = json({ user: result.user });
    response.headers.append('Set-Cookie', await sessionCookieFor(request, result.token, wantsRemember(reqBody)));
    return response;
  }

  if (parts[0] === 'auth' && parts[1] === 'logout' && method === 'POST') {
    await logout(request);
    const response = json({ ok: true });
    response.headers.append('Set-Cookie', clearSessionCookie(secureCookie(request)));
    return response;
  }

  if (parts[0] === 'analytics' && method === 'POST') {
    const payload = await body(request);
    const user = await currentUser(request);
    const eventType = String(payload.eventType || '');
    const metadata = payload.metadata && typeof payload.metadata === 'object' ? (payload.metadata as Record<string, unknown>) : {};
    await logEvent(eventType as any, metadata, user?.id || null);
    return json({ ok: true });
  }

  if (parts[0] === 'export' && parts[1] === 'letterboxd.csv' && parts.length === 2 && method === 'GET') {
    const user = await requireUser(request);
    const { exportLetterboxdCsv } = await import('../../import/letterboxd');
    return new Response(await exportLetterboxdCsv(user), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="cinepulse-letterboxd.csv"',
        'Cache-Control': 'no-store',
      },
    });
  }

  if (parts[0] === 'export' && parts.length === 1 && method === 'GET') {
    const user = await requireUser(request);
    const response = json(await exportAccount(user));
    response.headers.set('Content-Disposition', 'attachment; filename="cinepulse-export.json"');
    return response;
  }

  if (parts[0] === 'account' && parts[1] === 'delete' && parts[2] === 'otp' && method === 'POST') {
    const user = await requireUser(request);
    await requestDeleteOtp(user);
    return json({ ok: true });
  }

  if (parts[0] === 'account' && method === 'DELETE') {
    const user = await requireUser(request);
    await deleteAccountWithOtp(user, (await body(request)).otp);
    const response = json({ ok: true });
    response.headers.append('Set-Cookie', clearSessionCookie(secureCookie(request)));
    return response;
  }
  return null;
}
