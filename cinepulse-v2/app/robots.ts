import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.APP_ORIGIN || 'https://cinepulse.app';
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/auth/',
        '/?view=account',
        '/?view=library',
        '/?view=movie-night',
        '/?view=circles',
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
