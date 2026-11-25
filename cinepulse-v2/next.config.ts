import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    // JSON seed/model files only: the SQLite database must never ship in a deploy bundle.
    '/**': ['./data/*.json', './migrations/**/*'],
  },
  async headers() { return [
    // The service worker must always be re-checked, and may only run same-origin code.
    {source:'/sw.js', headers:[{key:'Content-Type',value:'application/javascript; charset=utf-8'},{key:'Cache-Control',value:'no-cache, no-store, must-revalidate'},{key:'Service-Worker-Allowed',value:'/'},{key:'Content-Security-Policy',value:"default-src 'self'; script-src 'self'"}]},
    {source:'/:path*', headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'DENY'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=(self)'},{key:'Strict-Transport-Security',value:'max-age=63072000; includeSubDomains'}]}]; },
};
export default nextConfig;
