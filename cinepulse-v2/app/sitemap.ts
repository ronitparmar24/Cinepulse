import type { MetadataRoute } from 'next';
import { db } from '../lib/db';

export default function sitemap(): MetadataRoute.Sitemap {
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
    const publicUsers = d.prepare(`
      SELECT username
      FROM users
      WHERE username IS NOT NULL AND profile_visibility = 'public'
      LIMIT 100
    `).all() as { username: string }[];

    for (const u of publicUsers) {
      dynamicRoutes.push({
        url: `${baseUrl}/user/${encodeURIComponent(u.username)}`,
        lastModified: now,
        changeFrequency: 'daily',
        priority: 0.6,
      });
    }

    // 2. Resolved & featured titles from prediction logs
    const titles = d.prepare(`
      SELECT DISTINCT title_id
      FROM predictions_log
      LIMIT 100
    `).all() as { title_id: string }[];

    for (const t of titles) {
      dynamicRoutes.push({
        url: `${baseUrl}/?title=${encodeURIComponent(t.title_id)}`,
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
