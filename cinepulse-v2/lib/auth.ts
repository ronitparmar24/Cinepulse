import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { User } from './types';
import { db, now, transaction, cacheSet, cacheGet } from './db';
import { bad, conflict, forbidden, tooMany, unauthorized } from './errors';
import { isSupabaseConfigured, createSupabaseClientFromRequest, supabaseAdmin, getSupabaseUrl } from './supabase';
import { generateOtp, sendOtpEmail, sendWelcomeEmail } from './mailer';

const scrypt = promisify(scryptCb);
const SESSION_DAYS = 14;
const attempts = new Map<string, {count:number; until:number}>();

function userRow(row: any): User { return {id:row.id,name:row.name,email:row.email,createdAt:row.created_at,isGoogle:Boolean(row.password_hash?.startsWith('oauth:google:'))}; }
function email(value: unknown): string { if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw bad('Email is invalid'); return value.trim().toLowerCase(); }
function name(value: unknown): string { if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 80) throw bad('Name is invalid'); return value.trim(); }
function password(value: unknown): string { if (typeof value !== 'string' || value.length < 10 || value.length > 200) throw bad('Password must be 10 to 200 characters'); return value; }
function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
async function hashPassword(value: string): Promise<string> { const salt=randomBytes(16).toString('hex'); const key=await scrypt(value,salt,64) as Buffer; return `scrypt:${salt}:${key.toString('hex')}`; }
async function checkPassword(value: string, stored: string): Promise<boolean> { const [,salt,hex]=stored.split(':'); if (!salt || !hex) return false; const key=await scrypt(value,salt,64) as Buffer; const expected=Buffer.from(hex,'hex'); return expected.length===key.length && timingSafeEqual(expected,key); }
export function sessionCookie(token: string, secure = false): string { return `cinepulse_session=${token}; Path=/; Max-Age=${SESSION_DAYS*86400}; HttpOnly; SameSite=Lax${secure?'; Secure':''}`; }
export function clearSessionCookie(secure = false): string { return `cinepulse_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure?'; Secure':''}`; }
export function oauthStateCookie(state: string, secure = false): string { return `cinepulse_oauth_state=${state}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${secure?'; Secure':''}`; }
export function clearOAuthStateCookie(secure = false): string { return `cinepulse_oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure?'; Secure':''}`; }
function tokenFromCookie(cookie: string | null): string | null { const match=cookie?.match(/(?:^|;\s*)cinepulse_session=([^;]+)/); if (!match) return null; try { return decodeURIComponent(match[1]); } catch { return null; } }
export async function currentUser(request: Request): Promise<User | null> {
  if (isSupabaseConfigured()) {
    const supabase = createSupabaseClientFromRequest(request);
    if (supabase) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (user && !error) {
          const meta = user.user_metadata || {};
          const isGoogle = user.app_metadata?.provider === 'google' || user.identities?.some(i => i.provider === 'google');
          return {
            id: user.id,
            name: (meta.name || meta.full_name || user.email?.split('@')[0] || 'Film Lover').slice(0, 80),
            email: (user.email || '').toLowerCase().trim(),
            createdAt: user.created_at,
            isGoogle: Boolean(isGoogle),
          };
        }
      } catch {}
    }
  }
  const token=tokenFromCookie(request.headers.get('cookie')); if (!token) return null;
  const row=db().prepare('SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?').get(hashToken(token)) as any;
  if (!row) return null; if (row.expires_at <= now()) { db().prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token)); return null; }
  return userRow(row);
}
export async function requireUser(request: Request): Promise<User> { const user=await currentUser(request); if (!user) throw unauthorized(); return user; }
function originOf(value: string | null): string | null {
  if (!value) return null;
  try { const url=new URL(value); if (url.protocol!=='http:' && url.protocol!=='https:') return null; return url.origin; } catch { return null; }
}
function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}
function normalizePort(port: string, protocol: string): string {
  if (port) return port;
  return protocol === 'https:' ? '443' : '80';
}
function originsMatch(originStr: string, targetStr: string): boolean {
  if (originStr === targetStr) return true;
  try {
    const o = new URL(originStr);
    const t = new URL(targetStr);
    if (o.protocol !== t.protocol) return false;
    if (o.host === t.host) return true;
    if (isLoopback(o.hostname) && isLoopback(t.hostname)) {
      return normalizePort(o.port, o.protocol) === normalizePort(t.port, t.protocol);
    }
  } catch {}
  return false;
}
export function effectiveOrigin(request: Request): string {
  const configured = process.env.APP_ORIGIN;
  if (configured) {
    const o = originOf(configured);
    if (o) return o;
  }
  const host = request.headers.get('host');
  if (host) {
    const proto = request.headers.get('x-forwarded-proto') || (request.url.startsWith('https:') ? 'https' : 'http');
    return `${proto}://${host}`;
  }
  return originOf(request.url) || 'http://127.0.0.1:3000';
}
function trustedOrigin(request: Request): string | null {
  const configured=process.env.APP_ORIGIN;
  return configured ? originOf(configured) : originOf(request.url);
}
export function enforceOrigin(request: Request): void {
  const originHeader = request.headers.get('origin');
  const refererHeader = request.headers.get('referer');
  const origin = originOf(originHeader) || originOf(refererHeader);
  const expected = trustedOrigin(request);
  const hostHeader = request.headers.get('host');

  if (!origin) throw forbidden('Cross-origin request blocked');

  if (expected && originsMatch(origin, expected)) return;

  if (hostHeader) {
    const proto = request.url.startsWith('https:') ? 'https:' : 'http:';
    const hostOrigin = originOf(`${proto}//${hostHeader}`);
    if (hostOrigin && originsMatch(origin, hostOrigin)) return;
  }

  throw forbidden('Cross-origin request blocked');
}
function rateLimit(key: string): void { const t=Date.now(); if (attempts.size > 10000) for (const [k,v] of attempts) if (v.until <= t) attempts.delete(k); const current=attempts.get(key); if (current && current.until > t && current.count >= 10) throw tooMany('Too many authentication attempts'); if (!current || current.until <= t) attempts.set(key,{count:1,until:t+15*60_000}); else current.count++; }
function isDuplicateEmailError(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown };
  const message = typeof candidate?.message === 'string' ? candidate.message : '';
  return /UNIQUE constraint failed:\s*users\.email/i.test(message)
    || (candidate?.code === 'SQLITE_CONSTRAINT_UNIQUE' && /users\.email/i.test(message));
}
export async function register(input: any): Promise<{user:User;token:string}> {
  const n=name(input?.name), e=email(input?.email), p=password(input?.password); rateLimit(`register:${e}`);
  
  if (isSupabaseConfigured()) {
    const admin = supabaseAdmin();
    if (admin) {
      const { data, error } = await admin.auth.admin.createUser({
        email: e,
        password: p,
        user_metadata: { name: n, full_name: n },
        email_confirm: true,
      });
      if (error) {
        if (error.message?.toLowerCase().includes('already') || (error as any).code === 'email_exists') {
          throw conflict('An account with this email already exists');
        }
        throw bad(error.message);
      }
      if (!data.user) throw bad('Failed to create account');
      const user: User = {
        id: data.user.id,
        name: n,
        email: e,
        createdAt: data.user.created_at,
        isGoogle: false,
      };
      await syncSupabaseUserToLocal(user);
      sendWelcomeEmail({ to: user.email, name: user.name }).catch(console.error);
      return { user, token: await createSession(user.id) };
    }
  }

  const d=db();
  if (d.prepare('SELECT 1 FROM users WHERE email=?').get(e)) throw conflict('An account with this email already exists');
  const user={id:randomUUID(),name:n,email:e,createdAt:now()}, hash=await hashPassword(p);
  try {
    d.prepare('INSERT INTO users(id,name,email,password_hash,created_at) VALUES(?,?,?,?,?)').run(user.id,user.name,user.email,hash,user.createdAt);
    sendWelcomeEmail({ to: user.email, name: user.name }).catch(console.error);
  } catch (error) {
    if (isDuplicateEmailError(error)) throw conflict('An account with this email already exists');
    throw error;
  }
  return {user,token:await createSession(user.id)};
}

export async function requestEmailOtp(input: any): Promise<{ email: string; name: string; devMode: boolean; isRegister: boolean; notice?: string }> {
  const e = email(input?.email);
  const isRegister = Boolean(input?.register);
  let n = typeof input?.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 80) : '';
  const p = typeof input?.password === 'string' && input.password.length >= 8 ? input.password : '';
  rateLimit(`otp_req:${e}`);

  const d = db();
  const existingLocal = d.prepare('SELECT * FROM users WHERE email=?').get(e) as any;

  if (isRegister && existingLocal) {
    throw conflict('An account with this email already exists. Please sign in.');
  }

  if (existingLocal && !n) {
    n = existingLocal.name;
  }
  if (!n) {
    n = e.split('@')[0];
  }

  const code = generateOtp();
  const codeHash = createHash('sha256').update(code).digest('hex');
  const pwdHash = p ? await hashPassword(p) : (existingLocal?.password_hash || await hashPassword(randomBytes(16).toString('hex')));
  const expiresAt = Date.now() + 10 * 60 * 1000;

  d.prepare(`
    INSERT INTO email_verifications(email, code_hash, name, password_hash, expires_at, attempts, created_at)
    VALUES(?, ?, ?, ?, ?, 0, ?)
    ON CONFLICT(email) DO UPDATE SET
      code_hash=excluded.code_hash,
      name=excluded.name,
      password_hash=excluded.password_hash,
      expires_at=excluded.expires_at,
      attempts=0,
      created_at=excluded.created_at
  `).run(e, codeHash, n, pwdHash, expiresAt, now());

  const result = await sendOtpEmail({ to: e, name: n, code });
  return {
    email: e,
    name: n,
    devMode: result.devMode,
    isRegister,
    notice: result.notice,
  };
}

export async function verifyEmailOtp(input: any): Promise<{ user: User; token: string }> {
  const e = email(input?.email);
  const codeInput = typeof input?.code === 'string' ? input.code.trim().replace(/\s+/g, '') : '';
  if (!/^\d{6}$/.test(codeInput)) {
    throw bad('Please enter a valid 6-digit verification code');
  }
  rateLimit(`otp_verify:${e}`);

  const d = db();
  const row = d.prepare('SELECT * FROM email_verifications WHERE email=?').get(e) as any;
  if (!row) {
    throw bad('No pending verification found for this email, or code expired. Please request a new code.');
  }

  if (Number(row.expires_at) <= Date.now()) {
    d.prepare('DELETE FROM email_verifications WHERE email=?').run(e);
    throw bad('Verification code has expired. Please request a new code.');
  }

  if (Number(row.attempts) >= 5) {
    d.prepare('DELETE FROM email_verifications WHERE email=?').run(e);
    throw bad('Too many failed attempts. Please request a new verification code.');
  }

  const codeHash = createHash('sha256').update(codeInput).digest('hex');
  if (codeHash !== row.code_hash) {
    d.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE email=?').run(e);
    const remaining = 5 - (Number(row.attempts) + 1);
    throw bad(`Invalid verification code. ${remaining > 0 ? `${remaining} attempts remaining.` : 'Code revoked. Please request a new code.'}`);
  }

  // Check if existing user is logging in
  const existingLocal = d.prepare('SELECT * FROM users WHERE email=?').get(e) as any;
  if (existingLocal) {
    d.prepare('DELETE FROM email_verifications WHERE email=?').run(e);
    return { user: userRow(existingLocal), token: await createSession(existingLocal.id) };
  }

  // If new user and Supabase configured
  if (isSupabaseConfigured()) {
    const admin = supabaseAdmin();
    if (admin) {
      const { data, error } = await admin.auth.admin.createUser({
        email: e,
        email_confirm: true,
        user_metadata: { name: row.name, full_name: row.name },
      });
      if (error && !error.message?.toLowerCase().includes('already')) {
        throw bad(error.message);
      }
      const userId = data?.user?.id || randomUUID();
      const user: User = {
        id: userId,
        name: row.name,
        email: e,
        createdAt: data?.user?.created_at || now(),
        isGoogle: false,
      };
      await syncSupabaseUserToLocal(user);
      d.prepare('DELETE FROM email_verifications WHERE email=?').run(e);
      sendWelcomeEmail({ to: user.email, name: user.name }).catch(console.error);
      return { user, token: await createSession(user.id) };
    }
  }

  const user: User = { id: randomUUID(), name: row.name, email: e, createdAt: now() };
  try {
    d.prepare('INSERT INTO users(id, name, email, password_hash, created_at) VALUES(?, ?, ?, ?, ?)')
      .run(user.id, user.name, user.email, row.password_hash, user.createdAt);
    sendWelcomeEmail({ to: user.email, name: user.name }).catch(console.error);
  } catch (error) {
    if (isDuplicateEmailError(error)) throw conflict('An account with this email already exists');
    throw error;
  }

  d.prepare('DELETE FROM email_verifications WHERE email=?').run(e);
  return { user, token: await createSession(user.id) };
}

export async function resendEmailOtp(input: any): Promise<{ ok: boolean; devMode: boolean; notice?: string }> {
  const e = email(input?.email);
  rateLimit(`otp_resend:${e}`);

  const d = db();
  const row = d.prepare('SELECT * FROM email_verifications WHERE email=?').get(e) as any;
  if (!row) {
    throw bad('No pending verification found for this email. Please submit the sign-up form.');
  }

  const code = generateOtp();
  const codeHash = createHash('sha256').update(code).digest('hex');
  const expiresAt = Date.now() + 10 * 60 * 1000;

  d.prepare('UPDATE email_verifications SET code_hash=?, expires_at=?, attempts=0 WHERE email=?').run(codeHash, expiresAt, e);

  const result = await sendOtpEmail({ to: e, name: row.name, code });
  return { ok: true, devMode: result.devMode, notice: result.notice };
}

export async function login(input: any, _request: Request): Promise<{user:User;token:string}> {
  const e=email(input?.email); const p=password(input?.password); rateLimit(`login:${e}`);
  
  if (isSupabaseConfigured()) {
    const admin = supabaseAdmin();
    if (admin) {
      const { data, error } = await admin.auth.signInWithPassword({ email: e, password: p });
      if (!error && data.user) {
        const meta = data.user.user_metadata || {};
        const user: User = {
          id: data.user.id,
          name: meta.name || meta.full_name || e.split('@')[0],
          email: e,
          createdAt: data.user.created_at,
          isGoogle: data.user.app_metadata?.provider === 'google',
        };
        await syncSupabaseUserToLocal(user);
        return { user, token: await createSession(user.id) };
      }
    }
  }

  const row=db().prepare('SELECT * FROM users WHERE email=?').get(e) as any; if (!row || !(await checkPassword(p,row.password_hash))) throw unauthorized();
  return {user:userRow(row),token:await createSession(row.id)};
}
export async function syncSupabaseUserToLocal(user: User): Promise<void> {
  const d = db();
  const existing = d.prepare('SELECT id FROM users WHERE id=?').get(user.id);
  if (!existing) {
    d.prepare('INSERT INTO users(id,name,email,password_hash,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, email=excluded.email')
      .run(user.id, user.name, user.email, 'oauth:supabase:' + user.id, user.createdAt);
  }
}
export async function createSession(userId: string): Promise<string> { const token=randomBytes(32).toString('base64url'); const expires=new Date(Date.now()+SESSION_DAYS*86400_000).toISOString(); db().prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(hashToken(token),userId,expires,now()); return token; }
export function logout(request: Request): void { const token=tokenFromCookie(request.headers.get('cookie')); if (token) db().prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token)); }
export function secureCookie(request: Request): boolean { return trustedOrigin(request)?.startsWith('https://') === true; }
export async function requestDeleteOtp(user: User): Promise<void> {
  rateLimit(`delete_req:${user.email}`);
  const code = generateOtp();
  const codeHash = createHash('sha256').update(code).digest('hex');
  cacheSet(`delete_otp:${user.email}`, { codeHash, attempts: 0 }, 10 * 60 * 1000);
  await sendOtpEmail({ to: user.email, name: user.name, code });
}
export async function deleteAccountWithOtp(user: User, otp: unknown): Promise<void> {
  rateLimit(`delete_verify:${user.email}`);
  const codeInput = typeof otp === 'string' ? otp.trim().replace(/\s+/g, '') : '';
  if (!/^\d{6}$/.test(codeInput)) throw bad('Please enter a valid 6-digit verification code');

  const cacheKey = `delete_otp:${user.email}`;
  const cached = cacheGet<{ codeHash: string; attempts: number }>(cacheKey);
  if (!cached) throw bad('No pending deletion code found, or code expired. Please request a new code.');

  if (cached.attempts >= 5) {
    cacheSet(cacheKey, null, 0);
    throw bad('Too many failed attempts. Please request a new code.');
  }

  const codeHash = createHash('sha256').update(codeInput).digest('hex');
  if (codeHash !== cached.codeHash) {
    cached.attempts += 1;
    cacheSet(cacheKey, cached, 10 * 60 * 1000);
    const remaining = 5 - cached.attempts;
    throw bad(`Invalid code. ${remaining > 0 ? `${remaining} attempts remaining.` : 'Code revoked.'}`);
  }

  cacheSet(cacheKey, null, 0);

  if (isSupabaseConfigured()) {
    const admin = supabaseAdmin();
    if (admin) {
      try { await admin.auth.admin.deleteUser(user.id); } catch {}
    }
  }
  transaction(()=>{ db().prepare('DELETE FROM users WHERE id=?').run(user.id); });
}
export async function exportAccount(user: User): Promise<any> {
  const d=db(); const library=d.prepare('SELECT title_json,status,rating,updated_at FROM library WHERE user_id=? ORDER BY updated_at DESC').all(user.id) as any[];
  const forecasts=d.prepare('SELECT title_id,choice,confidence,reason,created_at,updated_at FROM forecasts WHERE user_id=? ORDER BY updated_at DESC').all(user.id) as any[];
  const reviews=d.prepare('SELECT id,title_id,title_name,body,rating,spoiler,kind,created_at FROM reviews WHERE user_id=? ORDER BY created_at DESC').all(user.id) as any[];
  const forecastHistory=d.prepare('SELECT title_id,choice,confidence,reason,created_at,first_submission,release_date FROM forecast_events WHERE user_id=? ORDER BY created_at DESC').all(user.id);
  return {user,library:library.map(x=>({title:JSON.parse(x.title_json),status:x.status,rating:x.rating,updatedAt:x.updated_at})),forecasts,forecastHistory, reviews:reviews.map(x=>({...x,spoiler:Boolean(x.spoiler)}))};
}

// ─── Google OAuth Integration ───────────────────────────────────────────────
export interface GoogleUserInfo {
  sub: string;
  name: string;
  email: string;
  picture?: string;
}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getGoogleOAuthUrl(request: Request, state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw bad('Google OAuth is not configured');
  const redirectUri = `${effectiveOrigin(request)}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
    access_type: 'online'
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(request: Request, code: string): Promise<GoogleUserInfo> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw bad('Google OAuth credentials not configured');

  const redirectUri = `${effectiveOrigin(request)}/api/auth/google/callback`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    }).toString()
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error('Google token exchange error:', errText);
    throw bad(`Google authorization failed (${tokenRes.status})`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) throw bad('Google did not return an access token');

  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!userRes.ok) throw bad('Failed to retrieve user profile from Google');

  const profile = await userRes.json();
  if (!profile.email) throw bad('Google profile did not provide an email');

  return {
    sub: profile.sub,
    name: profile.name || profile.email.split('@')[0],
    email: profile.email.toLowerCase().trim(),
    picture: profile.picture
  };
}

export async function loginOrRegisterGoogleUser(profile: GoogleUserInfo): Promise<{ user: User; token: string }> {
  const d = db();
  const e = email(profile.email);
  let row = d.prepare('SELECT * FROM users WHERE email=?').get(e) as any;
  if (!row) {
    const u: User = {
      id: randomUUID(),
      name: (profile.name || e.split('@')[0]).slice(0, 80),
      email: e,
      createdAt: now(),
      isGoogle: true
    };
    d.prepare('INSERT INTO users(id, name, email, password_hash, created_at) VALUES(?,?,?,?,?)')
      .run(u.id, u.name, u.email, `oauth:google:${profile.sub}`, u.createdAt);
    row = { id: u.id, name: u.name, email: u.email, created_at: u.createdAt, password_hash: `oauth:google:${profile.sub}` };
    sendWelcomeEmail({ to: u.email, name: u.name }).catch(console.error);
  }
  const token = await createSession(row.id);
  return { user: userRow(row), token };
}

export async function demoGoogleLogin(customEmail?: string, customName?: string): Promise<{ user: User; token: string }> {
  const e = customEmail && customEmail.includes('@') ? customEmail.trim().toLowerCase() : 'ronit@gmail.com';
  const n = customName?.trim() || (e === 'ronit@gmail.com' ? 'Ronit Parmar' : 'Google Cinephile');
  return loginOrRegisterGoogleUser({
    sub: 'demo-google-' + hashToken(e).slice(0, 16),
    name: n,
    email: e
  });
}

