/**
 * Content-Security-Policy with a per-request nonce (see node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
 *
 * - Scripts: only those carrying this request's nonce; 'strict-dynamic' lets them load
 *   further scripts (e.g. the Cloudflare Turnstile widget).
 * - Styles: inline allowed — the UI uses many React `style` attributes, which a nonce cannot cover.
 * - Images: any HTTPS source (TMDB, YouTube thumbnails, avatars), plus data:/blob:.
 * - Frames: YouTube trailers and Turnstile only. Nobody may frame CinePulse.
 */
import { NextResponse, type NextRequest } from 'next/server';

export function buildCsp(nonce: string, isDev: boolean, isHttps = true): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? ` 'unsafe-eval'` : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' https://challenges.cloudflare.com https://*.supabase.co${isDev ? ' ws:' : ''}`,
    `frame-src https://www.youtube.com https://www.youtube-nocookie.com https://challenges.cloudflare.com`,
    `media-src 'self' https:`,
    // The installable app's service worker (public/sw.js). 'strict-dynamic' above ignores 'self', so it is named here.
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    // Only over HTTPS: on `next start` served as http://127.0.0.1 this directive would
    // rewrite every same-origin script/style request to https:// and break the page.
    ...(!isDev && isHttps ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const isHttps = (forwardedProto || request.nextUrl.protocol.replace(':', '')) === 'https';
  const csp = buildCsp(nonce, process.env.NODE_ENV === 'development', isHttps);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|icon.svg|manifest.json|sw.js|icons/|assets/).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
