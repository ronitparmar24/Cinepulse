import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { catalog, catalogConfig, checkCatalogHealth, genres, season, titleById, watchProviders, similar, recommended, person } from '../../../lib/catalog';
import {
  currentUser, deleteAccountWithOtp, requestDeleteOtp, enforceOrigin, exportAccount, login, logout, register, requireUser,
  secureCookie, sessionCookie, clearSessionCookie, oauthStateCookie, clearOAuthStateCookie,
  isGoogleConfigured, getGoogleOAuthUrl, exchangeGoogleCode, loginOrRegisterGoogleUser, demoGoogleLogin,
  effectiveOrigin, createSession, syncSupabaseUserToLocal, requestEmailOtp, verifyEmailOtp, resendEmailOtp
} from '../../../lib/auth';
import { getLatestDevEmail, sendLoginNotificationEmail } from '../../../lib/mailer';
import { isSupabaseConfigured, getSupabaseUrl, supabaseAdmin } from '../../../lib/supabase';
import { listLibrary, putLibrary, deleteLibrary } from '../../../lib/library';
import { community, titleReviews, putReview, deleteReview } from '../../../lib/reviews';
import { getPulse, myForecasts, putForecast } from '../../../lib/pulse';
import { getPrediction } from '../../../lib/prediction';
import { HttpError, asError, bad, unauthorized } from '../../../lib/errors';
import type { User } from '../../../lib/types';
import { getPublicProfile, updateUserProfile } from '../../../lib/social/profile';
import { followUser, unfollowUser, getPendingFollowRequests, acceptFollowRequest, declineFollowRequest, getFollowers, getFollowing } from '../../../lib/social/follows';
import { getFollowedFeed, getGlobalFeed, revealSpoiler } from '../../../lib/social/activity';
import { toggleLike, getLikesSummary, addComment, deleteComment, getComments, blockUser, unblockUser } from '../../../lib/social/interactions';
import { getTasteMatch, getMutualWatchlist, getWhoToFollowSuggestions } from '../../../lib/social/differentiators';
import { getNotifications, getUnreadCount, markNotificationsAsRead } from '../../../lib/social/notifications';
import { getPrivacySettings, updatePrivacySettings } from '../../../lib/social/visibility';
import { createList, updateList, deleteList, getUserLists } from '../../../lib/social/lists';
import { getUserWatchlist, getUserDiary, getUserReviews, getUserPredictions } from '../../../lib/social/subresources';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{path:string[]}> };
function json(data: unknown, status=200, headers?: HeadersInit) { return NextResponse.json(data,{status,headers}); }
function err(error: unknown) { const e=asError(error); return json({error:e.message},e.status); }
async function body(request: Request): Promise<Record<string,unknown>> {
  const contentType=request.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw bad('JSON content type is required');
  const length=request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length)>16*1024)) throw bad('Request body is too large');
  let text:string; try { text=await request.text(); } catch { throw bad('Invalid JSON body'); }
  if (new TextEncoder().encode(text).byteLength > 16*1024) throw bad('Request body is too large');
  let value:unknown; try { value=JSON.parse(text); } catch { throw bad('Invalid JSON body'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad('JSON body must be an object');
  return value as Record<string,unknown>;
}
function param(parts:string[], index:number, label:string): string { const value=parts[index]; if (!value) throw bad(`${label} is required`); return value; }
function media(value:string|null): 'all'|'movie'|'tv' { if (!value || value==='all') return 'all'; if (value==='movie'||value==='tv') return value; throw bad('media is invalid'); }
function collection(value:string|null): 'trending'|'upcoming'|'top'|'now-playing' { if (!value || value==='trending') return 'trending'; if (value==='upcoming'||value==='top'||value==='now-playing') return value; throw bad('collection is invalid'); }
function page(value:string|null):number { const n=value ? Number(value) : 1; if (!Number.isInteger(n)||n<1||n>500) throw bad('page is invalid'); return n; }
function optYear(value:string|null):number|undefined { if(!value)return undefined; const n=Number(value); if(!Number.isInteger(n)||n<1900||n>2100)throw bad('year is invalid'); return n; }
function optRating(value:string|null):number|undefined { if(!value)return undefined; const n=Number(value); if(n<0||n>10)throw bad('minRating is invalid'); return n; }

async function handle(request: NextRequest, parts: string[]): Promise<NextResponse> {
  const method=request.method, query=request.nextUrl.searchParams;
  if (method !== 'GET') enforceOrigin(request);
  if (parts[0] === 'config' && parts[1] === 'health' && parts.length === 2 && method==='GET') {
    return json({ ...catalogConfig(), health: await checkCatalogHealth(false) });
  }
  if (parts[0] === 'config' && parts[1] === 'health' && parts[2] === 'retry' && parts.length === 3 && method==='POST') {
    // This endpoint has no body and is Origin-protected by the dispatcher. It
    // performs one bounded provider check; it never returns or logs the token.
    return json({ ...catalogConfig(), health: await checkCatalogHealth(true) });
  }
  if (parts[0] === 'config' && parts.length === 1 && method==='GET') return json(catalogConfig());
  if (parts[0] === 'catalog' && method==='GET') return json(await catalog({media:media(query.get('media')),collection:collection(query.get('collection')),search:query.get('query')||undefined,genre:query.get('genre')||undefined,page:page(query.get('page')),year:optYear(query.get('year')),minRating:optRating(query.get('minRating')),sortBy:query.get('sortBy')||undefined}));
  if (parts[0] === 'genres' && method==='GET') return json(await genres(media(query.get('media'))));
  if (parts[0] === 'title' && parts.length>=2 && method==='GET') {
    const id=param(parts,1,'id');
    if (parts.length===4 && parts[2]==='season') { const n=Number(parts[3]); if (!Number.isInteger(n)||n<1||n>100) throw bad('Season number is invalid'); return json(await season(id,n)); }
    if (parts.length!==2) throw bad('Invalid title path'); return json({title:await titleById(id)});
  }
  if (parts[0] === 'auth' && parts[1] === 'me' && method==='GET') return json({user:await currentUser(request)});
  if (parts[0] === 'auth' && parts[1] === 'config' && method==='GET') return json({googleAuth:isGoogleConfigured(), supabaseAuth:isSupabaseConfigured()});
  if (parts[0] === 'auth' && parts[1] === 'google' && parts.length === 2 && method==='GET') {
    const demo = query.get('demo');
    if (demo === '1') {
      const result = await demoGoogleLogin(query.get('email') || undefined, query.get('name') || undefined);
      const res = NextResponse.redirect(new URL('/?auth_success=google', request.url));
      res.headers.append('Set-Cookie', sessionCookie(result.token, secureCookie(request)));
      return res;
    }
    if (isSupabaseConfigured()) {
      const returnUrl = encodeURIComponent(effectiveOrigin(request));
      return NextResponse.redirect(`${getSupabaseUrl()}/auth/v1/authorize?provider=google&redirect_to=${returnUrl}`);
    }
    if (isGoogleConfigured()) {
      const state = randomBytes(16).toString('hex');
      const url = getGoogleOAuthUrl(request, state);
      const res = NextResponse.redirect(url);
      res.headers.append('Set-Cookie', oauthStateCookie(state, secureCookie(request)));
      return res;
    }
    return NextResponse.redirect(new URL('/?google_notice=setup_required', request.url));
  }
  if (parts[0] === 'auth' && parts[1] === 'google' && parts[2] === 'callback' && method==='GET') {
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
  if (parts[0] === 'auth' && parts[1] === 'google' && parts[2] === 'demo' && method==='POST') {
    const reqBody = (await body(request).catch(() => ({}))) as Record<string, unknown>;
    const result = await demoGoogleLogin(
      typeof reqBody.email === 'string' ? reqBody.email : undefined,
      typeof reqBody.name === 'string' ? reqBody.name : undefined
    );
    const response = json({ user: result.user });
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
        const { data: { user: sbUser }, error } = await admin.auth.getUser(accessToken);
        if (error || !sbUser) throw unauthorized(error?.message || 'Invalid Supabase session');

        const meta = sbUser.user_metadata || {};
        const isGoogle = sbUser.app_metadata?.provider === 'google' || sbUser.identities?.some(i => i.provider === 'google');
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
            time: new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST'
          });
        } catch (mailErr) {
          console.error('[AUTH SESSION] Failed to send login notification:', mailErr);
        }
        const response = json({ user: appUser });
        response.headers.append('Set-Cookie', sessionCookie(token, secureCookie(request)));
        return response;
      }
    }
    throw bad('Supabase is not configured');
  }
  if (parts[0] === 'auth' && parts[1] === 'otp' && parts[2] === 'request' && method === 'POST') {
    const result = await requestEmailOtp(await body(request));
    return json(result);
  }
  if (parts[0] === 'auth' && parts[1] === 'otp' && parts[2] === 'verify' && method === 'POST') {
    const result = await verifyEmailOtp(await body(request));
    const response = json({ user: result.user, welcome: true });
    response.headers.append('Set-Cookie', sessionCookie(result.token, secureCookie(request)));
    return response;
  }
  if (parts[0] === 'auth' && parts[1] === 'otp' && parts[2] === 'resend' && method === 'POST') {
    const result = await resendEmailOtp(await body(request));
    return json(result);
  }
  if (parts[0] === 'auth' && parts[1] === 'otp' && parts[2] === 'preview' && method === 'GET') {
    const preview = getLatestDevEmail();
    if (!preview) return json({ message: 'No OTP emails have been sent yet in this session.' });
    if (request.headers.get('accept')?.includes('text/html') || query.get('format') === 'html') {
      return new NextResponse(preview.html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    return json(preview);
  }
  if (parts[0] === 'auth' && parts[1] === 'register' && method==='POST') { const result=await register(await body(request)); const response=json({user:result.user}); response.headers.append('Set-Cookie',sessionCookie(result.token,secureCookie(request))); return response; }
  if (parts[0] === 'auth' && parts[1] === 'login' && method==='POST') { const result=await login(await body(request),request); const response=json({user:result.user}); response.headers.append('Set-Cookie',sessionCookie(result.token,secureCookie(request))); return response; }
  if (parts[0] === 'auth' && parts[1] === 'logout' && method==='POST') { logout(request); const response=json({ok:true}); response.headers.append('Set-Cookie',clearSessionCookie(secureCookie(request))); return response; }
  if (parts[0] === 'library' && method==='GET' && parts.length===1) return json({items: await listLibrary(await requireUser(request))});
  if (parts[0] === 'library' && parts.length===2 && method==='PUT') { const user=await requireUser(request); await putLibrary(user,param(parts,1,'id'),await body(request)); return json({ok:true}); }
  if (parts[0] === 'library' && parts.length===2 && method==='DELETE') { await deleteLibrary(await requireUser(request),param(parts,1,'id')); return json({ok:true}); }
  if (parts[0] === 'community' && method==='GET' && parts.length===1) return json({reviews: await community()});
  if (parts[0] === 'reviews' && parts.length===2 && method==='GET') return json({reviews: await titleReviews(param(parts,1,'id'))});
  if (parts[0] === 'reviews' && parts.length===2 && method==='POST') { const user=await requireUser(request); await putReview(user,param(parts,1,'id'),await body(request)); return json({ok:true}); }
  if (parts[0] === 'reviews' && parts.length===2 && method==='DELETE') { await deleteReview(await requireUser(request),param(parts,1,'id')); return json({ok:true}); }
  if (parts[0] === 'pulse' && parts.length===2 && method==='GET') return json({pulse:await getPulse(param(parts,1,'id'),await currentUser(request))});
  if (parts[0] === 'pulse' && parts.length===2 && method==='POST') { const user=await requireUser(request); await putForecast(user,param(parts,1,'id'),await body(request)); return json({ok:true}); }
  if (parts[0] === 'my-forecasts' && method==='GET') return json({items:await myForecasts(await requireUser(request))});
  if (parts[0] === 'prediction' && parts.length===2 && method==='GET') {
    const id=param(parts,1,'id');
    const title=await titleById(id);
    const prediction=await getPrediction(id,title);
    return json({prediction});
  }
  if (parts[0] === 'export' && method==='GET') { const user=await requireUser(request); const response=json(await exportAccount(user)); response.headers.set('Content-Disposition','attachment; filename="cinepulse-export.json"'); return response; }
  if (parts[0] === 'account' && parts[1] === 'delete' && parts[2] === 'otp' && method==='POST') { const user=await requireUser(request); await requestDeleteOtp(user); return json({ok:true}); }
  if (parts[0] === 'account' && method==='DELETE') { const user=await requireUser(request); await deleteAccountWithOtp(user,(await body(request)).otp); const response=json({ok:true}); response.headers.append('Set-Cookie',clearSessionCookie(secureCookie(request))); return response; }
  // Feature 1: Watch Providers
  if (parts[0]==='providers' && parts.length===2 && method==='GET') return json({providers:await watchProviders(param(parts,1,'id'))});
  // Feature 2: Similar & Recommended
  if (parts[0]==='similar' && parts.length===2 && method==='GET') return json({items:await similar(param(parts,1,'id'))});
  if (parts[0]==='recommended' && parts.length===2 && method==='GET') return json({items:await recommended(param(parts,1,'id'))});
  // Feature 3: Person Profile
  if (parts[0]==='person' && parts.length===2 && method==='GET') { const pid=Number(parts[1]); if(!Number.isInteger(pid)||pid<1) throw bad('Invalid person id'); return json({person:await person(pid)}); }

  // ─── Social Layer Routes ───────────────────────────────────────────────────

  // Users public profile and sub-resources
  if (parts[0] === 'users' && parts.length >= 2 && method === 'GET') {
    const username = param(parts, 1, 'username');
    const viewer = await currentUser(request);
    const viewerId = viewer?.id || null;

    if (parts.length === 2) {
      const res = await getPublicProfile(username, viewerId);
      if (res.error && res.status) return json({ error: res.error }, res.status);
      return json(res.profile);
    }
    if (parts[2] === 'watchlist') {
      const res = getUserWatchlist(username, viewerId, Number(query.get('limit')) || 20, query.get('cursor'));
      if (!res.allowed) return json({ error: res.reason || 'Forbidden' }, 403);
      return json(res);
    }
    if (parts[2] === 'diary') {
      const res = getUserDiary(username, viewerId, Number(query.get('limit')) || 20, query.get('cursor'));
      if (!res.allowed) return json({ error: res.reason || 'Forbidden' }, 403);
      return json(res);
    }
    if (parts[2] === 'reviews') {
      const res = getUserReviews(username, viewerId, Number(query.get('limit')) || 20, query.get('cursor'));
      if (!res.allowed) return json({ error: res.reason || 'Forbidden' }, 403);
      return json(res);
    }
    if (parts[2] === 'lists') {
      return json({ lists: getUserLists(username, viewerId) });
    }
    if (parts[2] === 'predictions') {
      const res = getUserPredictions(username, viewerId);
      if (!res.allowed) return json({ error: res.reason || 'Forbidden' }, 403);
      return json(res);
    }
    if (parts[2] === 'followers') {
      const res = getFollowers(username, viewerId, Number(query.get('limit')) || 20, query.get('cursor'));
      if (res.error && res.httpStatus) return json({ error: res.error }, res.httpStatus);
      return json(res);
    }
    if (parts[2] === 'following') {
      const res = getFollowing(username, viewerId, Number(query.get('limit')) || 20, query.get('cursor'));
      if (res.error && res.httpStatus) return json({ error: res.error }, res.httpStatus);
      return json(res);
    }
    if (parts[2] === 'match') {
      return json(getTasteMatch(viewerId, username));
    }
    if (parts[2] === 'overlap') {
      return json(getMutualWatchlist(viewerId, username));
    }
  }

  // Profile update
  if (parts[0] === 'profile' && parts.length === 1 && method === 'POST') {
    const user = await requireUser(request);
    const b = await body(request) as any;
    const res = updateUserProfile(user.id, b);
    if (!res.success) return json({ error: res.error }, 400);
    return json({ ok: true });
  }

  // Follows
  if (parts[0] === 'follows' && parts[1] === 'requests' && method === 'GET') {
    const user = await requireUser(request);
    return json({ requests: getPendingFollowRequests(user.id) });
  }
  if (parts[0] === 'follows' && parts[1] === 'requests' && parts.length === 4 && method === 'POST') {
    const user = await requireUser(request);
    const followerId = param(parts, 2, 'id');
    const action = parts[3];
    if (action === 'accept') {
      const res = acceptFollowRequest(user.id, followerId);
      if (!res.success) return json({ error: res.error }, res.httpStatus || 400);
      return json({ ok: true });
    }
    if (action === 'decline') {
      const res = declineFollowRequest(user.id, followerId);
      if (!res.success) return json({ error: res.error }, res.httpStatus || 400);
      return json({ ok: true });
    }
  }
  if (parts[0] === 'follows' && parts.length === 2 && method === 'POST') {
    const user = await requireUser(request);
    const username = param(parts, 1, 'username');
    const res = followUser(user.id, username);
    if (!res.success) return json({ error: res.error }, res.httpStatus || 400);
    return json(res);
  }
  if (parts[0] === 'follows' && parts.length === 2 && method === 'DELETE') {
    const user = await requireUser(request);
    const username = param(parts, 1, 'username');
    const res = unfollowUser(user.id, username);
    if (!res.success) return json({ error: res.error }, res.httpStatus || 400);
    return json({ ok: true });
  }

  // Likes
  if (parts[0] === 'likes' && method === 'POST') {
    const user = await requireUser(request);
    const b = await body(request) as any;
    if (!b.targetType || !b.targetId) throw bad('targetType and targetId are required');
    return json(toggleLike(user.id, b.targetType, String(b.targetId), true));
  }
  if (parts[0] === 'likes' && method === 'DELETE') {
    const user = await requireUser(request);
    const targetType = query.get('targetType');
    const targetId = query.get('targetId');
    let b: any = {};
    if (!targetType || !targetId) {
      try { b = await body(request); } catch {}
    }
    const tType = (targetType || b.targetType) as any;
    const tId = String(targetId || b.targetId);
    if (!tType || !tId) throw bad('targetType and targetId are required');
    return json(toggleLike(user.id, tType, tId, false));
  }

  // Comments
  if (parts[0] === 'comments' && method === 'GET') {
    const targetType = query.get('targetType') as any;
    const targetId = query.get('targetId');
    if (!targetType || !targetId) throw bad('targetType and targetId are required');
    const viewer = await currentUser(request);
    return json({ comments: getComments(targetType, targetId, viewer?.id || null) });
  }
  if (parts[0] === 'comments' && method === 'POST') {
    const user = await requireUser(request);
    const b = await body(request) as any;
    const res = addComment(user.id, b.targetType, String(b.targetId), b.body);
    if (!res.success) return json({ error: res.error }, res.httpStatus || 400);
    return json({ comment: res.comment });
  }
  if (parts[0] === 'comments' && parts.length === 2 && method === 'DELETE') {
    const user = await requireUser(request);
    const commentId = Number(param(parts, 1, 'id'));
    const res = deleteComment(commentId, user.id);
    if (!res.success) return json({ error: res.error }, res.httpStatus || 400);
    return json({ ok: true });
  }

  // Blocks
  if (parts[0] === 'blocks' && parts.length === 2 && method === 'POST') {
    const user = await requireUser(request);
    const username = param(parts, 1, 'username');
    const res = blockUser(user.id, username);
    if (!res.success) return json({ error: res.error }, res.httpStatus || 400);
    return json({ ok: true });
  }
  if (parts[0] === 'blocks' && parts.length === 2 && method === 'DELETE') {
    const user = await requireUser(request);
    const username = param(parts, 1, 'username');
    const res = unblockUser(user.id, username);
    if (!res.success) return json({ error: res.error }, res.httpStatus || 400);
    return json({ ok: true });
  }

  // Activity feeds
  if (parts[0] === 'feed' && parts.length === 1 && method === 'GET') {
    const user = await requireUser(request);
    return json(getFollowedFeed(user.id, Number(query.get('limit')) || 20, query.get('cursor')));
  }
  if (parts[0] === 'feed' && parts[1] === 'global' && method === 'GET') {
    const viewer = await currentUser(request);
    return json(getGlobalFeed(viewer?.id || null, Number(query.get('limit')) || 20, query.get('cursor')));
  }

  // Notifications
  if (parts[0] === 'notifications' && parts.length === 1 && method === 'GET') {
    const user = await requireUser(request);
    return json(getNotifications(user.id, Number(query.get('limit')) || 20, query.get('cursor')));
  }
  if (parts[0] === 'notifications' && parts[1] === 'unread-count' && method === 'GET') {
    const user = await requireUser(request);
    return json({ count: getUnreadCount(user.id) });
  }
  if (parts[0] === 'notifications' && parts[1] === 'read' && method === 'POST') {
    const user = await requireUser(request);
    let ids: number[] | undefined;
    try {
      const b = await body(request);
      if (Array.isArray(b.ids)) ids = b.ids.map(Number);
    } catch {}
    markNotificationsAsRead(user.id, ids);
    return json({ ok: true });
  }

  // Privacy Settings
  if (parts[0] === 'privacy' && parts[1] === 'settings' && method === 'GET') {
    const user = await requireUser(request);
    return json({ settings: getPrivacySettings(user.id) });
  }
  if (parts[0] === 'privacy' && parts[1] === 'settings' && method === 'PUT') {
    const user = await requireUser(request);
    const b = await body(request) as any;
    const next = updatePrivacySettings(user.id, b);
    return json({ settings: next });
  }

  // User lists
  if (parts[0] === 'lists' && parts.length === 1 && method === 'POST') {
    const user = await requireUser(request);
    const b = await body(request) as any;
    const res = createList(user.id, b);
    if (!res.success) return json({ error: res.error }, 400);
    return json({ list: res.list });
  }
  if (parts[0] === 'lists' && parts.length === 2 && method === 'PUT') {
    const user = await requireUser(request);
    const listId = param(parts, 1, 'id');
    const b = await body(request) as any;
    const res = updateList(user.id, listId, b);
    if (!res.success) return json({ error: res.error }, 400);
    return json({ ok: true });
  }
  if (parts[0] === 'lists' && parts.length === 2 && method === 'DELETE') {
    const user = await requireUser(request);
    const listId = param(parts, 1, 'id');
    const res = deleteList(user.id, listId);
    if (!res.success) return json({ error: res.error }, 400);
    return json({ ok: true });
  }

  // Spoiler explicit reveal
  if (parts[0] === 'reviews' && parts.length === 3 && parts[2] === 'reveal' && method === 'POST') {
    const user = await requireUser(request);
    revealSpoiler(user.id, param(parts, 1, 'id'));
    return json({ ok: true });
  }

  // Follow suggestions
  if (parts[0] === 'suggestions' && parts[1] === 'who-to-follow' && method === 'GET') {
    const user = await requireUser(request);
    return json({ suggestions: getWhoToFollowSuggestions(user.id, Number(query.get('limit')) || 5) });
  }

  throw new HttpError(404,'Not found');
}

async function dispatch(request: NextRequest, context: Ctx) { try { const parts=(await context.params).path || []; return await handle(request,parts); } catch(error) { return err(error); } }
export async function GET(request: NextRequest, context: Ctx) { return dispatch(request,context); }
export async function POST(request: NextRequest, context: Ctx) { return dispatch(request,context); }
export async function PUT(request: NextRequest, context: Ctx) { return dispatch(request,context); }
export async function DELETE(request: NextRequest, context: Ctx) { return dispatch(request,context); }
