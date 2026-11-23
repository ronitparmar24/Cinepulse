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
  oauthStateCookie,
  register,
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

export async function handleAuth({ request, parts, method, query }: ApiContext): Promise<Response | null> {
  if (parts[0] === 'auth' && parts[1] === 'me' && method === 'GET') {
    // The session token stays in its HttpOnly cookie; it is never handed to page scripts.
    return json({ user: await currentUser(request) });
  }

  if (parts[0] === 'auth' && parts[1] === 'config' && method === 'GET')
    return json({ googleAuth: isGoogleConfigured(), supabaseAuth: false });

  if (parts[0] === 'auth' && parts[1] === 'google' && parts.length === 2 && method === 'GET') {
    const demo = query.get('demo');
    if (demo === '1' && devAuthAllowed()) {
      const result = await demoGoogleLogin(query.get('email') || undefined, query.get('name') || undefined);
      const res = NextResponse.redirect(new URL('/?auth_success=google', request.url));
      res.headers.append('Set-Cookie', sessionCookie(result.token, secureCookie(request)));
      return res;
    }
    if (isGoogleConfigured()) {
      const state = randomBytes(16).toString('hex');
      const url = getGoogleOAuthUrl(request, state);
      const res = NextResponse.redirect(url);
      res.headers.append('Set-Cookie', oauthStateCookie(state, secureCookie(request)));
      return res;
    }
    if (!devAuthAllowed()) {
      return NextResponse.redirect(new URL('/?auth_error=google_not_configured', request.url));
    }
    const fallbackResult = await demoGoogleLogin(query.get('email') || undefined, query.get('name') || undefined);
    const fallbackRes = NextResponse.redirect(new URL('/?auth_success=google', request.url));
    fallbackRes.headers.append('Set-Cookie', sessionCookie(fallbackResult.token, secureCookie(request)));
    return fallbackRes;
  }

  if (parts[0] === 'auth' && parts[1] === 'google' && parts[2] === 'callback' && method === 'GET') {
    const code = query.get('code');
    const state = query.get('state');
    const error = query.get('error');
    if (error) return NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(error)}`, request.url));
    if (!code) throw bad('Authorization code is required');
    const cookieHeader = request.headers.get('cookie') || '';
    const match = cookieHeader.match(/(?:^|;\s*)cinepulse_oauth_state=([^;]+)/);
    const savedState = match ? decodeURIComponent(match[1]) : null;
    if (!state || !savedState || state !== savedState) throw bad('Invalid or expired OAuth state');
    const profile = await exchangeGoogleCode(request, code);
    const result = await loginOrRegisterGoogleUser(profile);
    const res = NextResponse.redirect(new URL('/?auth_success=google', request.url));
    res.headers.append('Set-Cookie', sessionCookie(result.token, secureCookie(request)));
    res.headers.append('Set-Cookie', clearOAuthStateCookie(secureCookie(request)));
    return res;
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
    const result = await verifyEmailOtp(await body(request));
    await resetLoginRateLimit(ip, 'auth_otp_verify');
    await resetLoginRateLimit(ip, 'auth_login');
    const response = json({ user: result.user, welcome: true });
    response.headers.append('Set-Cookie', sessionCookie(result.token, secureCookie(request)));
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
    response.headers.append('Set-Cookie', sessionCookie(result.token, secureCookie(request)));
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
    response.headers.append('Set-Cookie', sessionCookie(result.token, secureCookie(request)));
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
