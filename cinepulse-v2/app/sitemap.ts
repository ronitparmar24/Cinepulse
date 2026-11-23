import type { MetadataRoute } from 'next';
import { db } from '../lib/db';
import { titlePath } from '../lib/slug';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.APP_ORIGIN || 'https://cinepulse.app';
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 1,
    },
    {
      url: `${baseUrl}/?view=predictions`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/?view=leaderboard`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/?view=accuracy`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/?view=community`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.7,
    },
  ];

  const dynamicRoutes: MetadataRoute.Sitemap = [];

  try {
    const d = db();
    // 1. Public user profiles
    const publicUsers = (await d.all(`
      SELECT username
      FROM users
      WHERE username IS NOT NULL AND profile_visibility = 'public'
      LIMIT 100
    `)) as { username: string }[];

    for (const u of publicUsers) {
      dynamicRoutes.push({
        url: `${baseUrl}/u/${encodeURIComponent(u.username)}`,
        lastModified: now,
        changeFrequency: 'daily',
        priority: 0.6,
      });
    }

    // 2. Resolved & featured titles from prediction logs
    // Titles people have saved, with a snapshot to build the readable /film or /tv URL from.
    const titles = (await d.all(`
      SELECT title_id, MAX(title_json) AS title_json
      FROM library
      WHERE title_json IS NOT NULL
      GROUP BY title_id
      LIMIT 500
    `)) as { title_id: string; title_json: string }[];

    for (const row of titles) {
      let t: { title?: string; mediaType?: 'movie' | 'tv' } = {};
      try { t = JSON.parse(row.title_json); } catch { continue; }
      if (!t.title) continue;
      dynamicRoutes.push({
        url: `${baseUrl}${titlePath({ id: row.title_id, title: t.title, mediaType: t.mediaType === 'tv' ? 'tv' : 'movie' })}`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.7,
      });
    }
  } catch {
    // If DB is unavailable during static bundle generation, return base static routes
  }

  return [...staticRoutes, ...dynamicRoutes];
}
