import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { hashPassword } from '../lib/auth.ts';

const dbPath = process.env.DATABASE_PATH || resolve(process.cwd(), 'data/cinepulse.db');
console.log(`Seeding demo account to: ${dbPath}`);

const d = new DatabaseSync(dbPath);
const userId = 'user_demo_curator';
const passwordHash = await hashPassword('cinepulse123');
const now = new Date().toISOString();

// Insert demo user
d.prepare(`
  INSERT OR REPLACE INTO users (id, name, email, password_hash, created_at, username, display_name, bio, avatar_url, profile_visibility, is_verified)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  userId,
  'Alex Vance',
  'demo@cinepulse.local',
  passwordHash,
  now,
  'alex_curator',
  'Alex Vance · CinePulse Curator',
  'Film archivist, weekend festival programmer, and predictive model tester.',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
  'public',
  1
);

// Pre-seeded library items with ratings to activate Taste DNA (>= 5 required)
const demoRatings = [
  { id: 'demo-dunes', title: 'Beyond the Dunes', rating: 9, status: 'watched' },
  { id: 'demo-station', title: 'Station Nowhere', rating: 8, status: 'watched' },
  { id: 'demo-neon', title: 'Neon Rain', rating: 7, status: 'watched' },
  { id: 'demo-glass', title: 'The Glass Orchard', rating: 9, status: 'watched' },
  { id: 'demo-sub', title: 'Subterfuge', rating: 8, status: 'watched' },
  { id: 'demo-quiet', title: 'A Quiet Harbor', rating: 6, status: 'watched' },
  { id: 'demo-solaris', title: 'Solaris Return', rating: 9, status: 'watchlist' },
  { id: 'demo-horizon', title: 'Event Horizon II', rating: null, status: 'watchlist' },
];

for (const item of demoRatings) {
  const titleJson = JSON.stringify({
    id: item.id,
    title: item.title,
    mediaType: 'movie',
    genres: ['Sci-Fi', 'Drama'],
    status: 'released',
    releaseDate: '2023-05-15'
  });

  d.prepare(`
    INSERT OR REPLACE INTO library (user_id, title_id, title_json, status, rating, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, item.id, titleJson, item.status, item.rating, now);
}

// Pre-seeded forecasts
d.prepare(`
  INSERT OR REPLACE INTO forecasts (user_id, title_id, choice, confidence, reason, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(userId, 'demo-dunes', 'hit', 85, 'Masterpiece visual scope with strong word-of-mouth momentum.', now, now);

console.log('Demo account successfully seeded:');
console.log('Email: demo@cinepulse.local');
console.log('Password: cinepulse123');
console.log('Taste DNA & Personalized sections ready.');
d.close();
