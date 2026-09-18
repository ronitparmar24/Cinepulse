import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { User } from './types';
import { db, now, transaction } from './db';
import { bad, conflict, forbidden, tooMany, unauthorized } from './errors';
import { isSupabaseConfigured, createSupabaseClientFromRequest, supabaseAdmin, getSupabaseUrl } from './supabase';

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
  const n=name(input?.name), e=email(input?.email), p=password(input?.password); rateLimit(`register:${e}`); const d=db();
  if (d.prepare('SELECT 1 FROM users WHERE email=?').get(e)) throw conflict('An account with this email already exists');
  const user={id:randomUUID(),name:n,email:e,createdAt:now()}, hash=await hashPassword(p);
  try {
    d.prepare('INSERT INTO users(id,name,email,password_hash,created_at) VALUES(?,?,?,?,?)').run(user.id,user.name,user.email,hash,user.createdAt);
  } catch (error) {
    if (isDuplicateEmailError(error)) throw conflict('An account with this email already exists');
    throw error;
  }
  return {user,token:await createSession(user.id)};
}
export async function login(input: any, _request: Request): Promise<{user:User;token:string}> {
  const e=email(input?.email); const p=password(input?.password); rateLimit(`login:${e}`);
  const row=db().prepare('SELECT * FROM users WHERE email=?').get(e) as any; if (!row || !(await checkPassword(p,row.password_hash))) throw unauthorized();
  return {user:userRow(row),token:await createSession(row.id)};
}
async function createSession(userId: string): Promise<string> { const token=randomBytes(32).toString('base64url'); const expires=new Date(Date.now()+SESSION_DAYS*86400_000).toISOString(); db().prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(hashToken(token),userId,expires,now()); return token; }
export function logout(request: Request): void { const token=tokenFromCookie(request.headers.get('cookie')); if (token) db().prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token)); }
export function secureCookie(request: Request): boolean { return trustedOrigin(request)?.startsWith('https://') === true; }
export async function deleteAccount(request: Request, user: User, supplied: unknown): Promise<void> {
  const row=db().prepare('SELECT password_hash FROM users WHERE id=?').get(user.id) as any; if (!row) throw unauthorized();
  if (!row.password_hash.startsWith('oauth:google:')) {
    const p=password(supplied);
    if (!(await checkPassword(p,row.password_hash))) throw unauthorized();
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

