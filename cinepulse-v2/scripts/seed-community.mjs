#!/usr/bin/env node
/**
 * CinePulse v7 — Synthetic Community Seeding (Tracks J, K, L)
 * Populates organic personas, backdated forecasts with realistic growth curves,
 * authentic reviews, comments, power-law likes, follows, and scored Brier leaderboard entries.
 * Protected by hard safety gates.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, transaction, now, realUsersOnly } from '../lib/db.ts';
import { generatePersonas } from './generate-personas.mjs';
import { putForecast } from '../lib/pulse.ts';
import { putReview } from '../lib/reviews.ts';
import { followUser } from '../lib/social/follows.ts';
import { addComment, toggleLike } from '../lib/social/interactions.ts';
import { updateUserBrierScore } from '../lib/cron/resolveCalls.ts';
import { hashPassword } from '../lib/auth.ts';

const isForce = process.argv.includes('--force');
const isSeedEnabled = process.env.SEED_COMMUNITY === '1' || isForce;

console.log('─── CinePulse Synthetic Community Seeding ──────────────');

if (!isSeedEnabled) {
  console.error('\n✖ Refusing to seed community:');
  console.error('  SEED_COMMUNITY=1 environment variable is not set.');
  console.error('  This is a demo/dev tool that should not touch production.');
  console.error('  To override locally, run: npm run seed:community -- --force\n');
  process.exit(1);
}

const d = db();

// Refuse to run against a database that has any non-demo real user forecasts
const realForecasts = d.prepare(`
  SELECT COUNT(*) as count
  FROM forecasts f
  JOIN users u ON u.id = f.user_id
  WHERE ${realUsersOnly('u')} AND u.id != 'user_demo_curator'
`).get();

if (Number(realForecasts?.count || 0) > 0 && !isForce) {
  console.error('\n✖ Refusing to seed community:');
  console.error(`  Database contains ${realForecasts.count} forecast(s) from real user accounts.`);
  console.error('  To force seeding anyway, pass --force.\n');
  process.exit(1);
}

// 1. Ensure personas exist
let personas = [];
const personasPath = resolve(process.cwd(), 'data/seed-personas.json');
if (existsSync(personasPath)) {
  try {
    personas = JSON.parse(readFileSync(personasPath, 'utf-8'));
  } catch {}
}
if (!Array.isArray(personas) || personas.length < 40) {
  personas = generatePersonas(50, true);
}

console.log(`\n1. Seeding ${personas.length} persona accounts (is_seed=1)...`);

// Hash password once for all seed accounts
const seedPasswordHash = await hashPassword('seedpassword123');

transaction(() => {
  const insertUser = d.prepare(`
    INSERT INTO users (id, name, email, password_hash, created_at, username, display_name, bio, avatar_url, profile_visibility, is_verified, is_seed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'public', 0, 1)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,
      username=excluded.username,
      display_name=excluded.display_name,
      bio=excluded.bio,
      avatar_url=excluded.avatar_url,
      is_seed=1
  `);

  const insertPrivacy = d.prepare(`
    INSERT OR IGNORE INTO privacy_settings (user_id, watchlist_visibility, diary_visibility, ratings_visibility, reviews_visibility, predictions_visibility, activity_visibility)
    VALUES (?, 'public', 'public', 'public', 'public', 'public', 'public')
  `);

  for (const p of personas) {
    const userCreatedAt = p.metadata?.generated_at || now();
    insertUser.run(
      p.id,
      p.displayName,
      `${p.username}@cinepulse.seed`,
      seedPasswordHash,
      userCreatedAt,
      p.username,
      p.displayName,
      p.bio,
      p.avatarUrl
    );
    insertPrivacy.run(p.id);
  }
});

console.log('   ✔ Personas inserted successfully.');

// 2. Load demo catalog titles
const catalogRaw = JSON.parse(readFileSync(resolve(process.cwd(), 'lib/demo-catalog.json'), 'utf-8'));
const titles = catalogRaw.map(([id, title, mediaType, genres, releaseDate, runtime, tagline, overview, director]) => ({
  id: id.startsWith('demo-') ? id : `demo-${id}`,
  title,
  mediaType,
  genres,
  releaseDate,
  runtime,
  tagline,
  overview,
  director
}));

console.log(`\n2. Seeding forecasts across ${titles.length} catalog titles with backdated organic timing...`);

const REASONS = {
  optimist: [
    'Massive presale momentum and the creative team has an unmatched commercial track record.',
    'Trailers are converting casual viewers into day-one attendees at impressive rates.',
    'Early social buzz and critical buzz suggest an opening multiplier above 3.2x.',
    'Strong IMAX screen allocation and stellar counter-programming window.',
    'Concept has broad demographic reach across domestic and international markets.'
  ],
  contrarian: [
    'Marketing spend is bloated and social engagement is front-loaded with diminishing returns.',
    'Budget is far too inflated to hit break-even in the current theatrical climate.',
    'Direct competition on weekend two will cannibalize core audience demographics.',
    'Word of mouth looks soft in preview screenings; multiplier will struggle to clear 2.1x.',
    'Audience fatigue with this sub-genre is evident in tracking telemetry.'
  ],
  'genre-specialist:horror': [
    'Terrific premise hook and horror continues to yield the highest theatrical ROI.',
    'Sound design and dread-building in the trailers indicate strong midnight word-of-mouth.',
    'Budget is lean enough to ensure immediate profitability on opening weekend alone.'
  ],
  'genre-specialist:scifi': [
    'High-concept world building with top-tier visual effects that justify premium formats.',
    'Director has a proven track record of converting ambitious sci-fi into box office gold.',
    'Strong appeal among tech and film enthusiast demographics with high repeat viewing potential.'
  ],
  'genre-specialist:action': [
    'Stunt choreography and kinetic pacing are prime material for strong word-of-mouth.',
    'Global appeal is massive; international box office should carry this to comfortable profitability.',
    'Audiences are hungry for practical stunts and star-driven action vehicles.'
  ],
  'genre-specialist:drama': [
    'Auteur vision with award season momentum that will sustain a long theatrical tail.',
    'Strong ensemble cast and emotional core that will play exceptionally well with adult audiences.',
    'Word-of-mouth will build steadily over 6 to 8 weeks rather than relying on opening day.'
  ],
  casual: [
    'Everyone I know is talking about this one. Looks like a guaranteed crowd-pleaser.',
    'Trailer was everywhere this month and the concept looks genuinely fun.',
    'Solid weekend entertainment that should easily beat expectations.'
  ],
  'lurker-who-rarely-votes': [
    'Cautious consensus play based on presale tracking metrics.'
  ]
};

function getReason(archetype, choice, index) {
  const pool = REASONS[archetype] || REASONS.casual;
  const base = pool[index % pool.length];
  if (choice === 'flop' && archetype === 'optimist') {
    return 'Even with high expectations, the crowded release corridor may limit initial theatrical legs.';
  }
  return base;
}

let totalForecastsSeeded = 0;
const nowMs = Date.now();

for (const title of titles) {
  // Determine participation per persona based on archetype
  for (let i = 0; i < personas.length; i++) {
    const p = personas[i];
    const archetype = p.archetype;
    const prefs = p.tastePreferences;

    // Filter participation
    let participateProb = 0.55;
    if (archetype === 'optimist') participateProb = 0.85;
    if (archetype === 'contrarian') participateProb = 0.75;
    if (archetype === 'lurker-who-rarely-votes') participateProb = 0.15;
    if (archetype.startsWith('genre-specialist:')) {
      const spec = archetype.replace('genre-specialist:', '').toLowerCase();
      const hasGenre = title.genres.some(g => g.toLowerCase().includes(spec));
      participateProb = hasGenre ? 0.95 : 0.25;
    }

    // Seed deterministic pseudo-random roll
    const roll = ((i * 37 + title.id.length * 13) % 100) / 100;
    if (roll > participateProb) continue;

    // Determine choice based on hitFlopOptimism + genre match
    let optimism = prefs.hitFlopOptimism;
    const isFavored = title.genres.some(g => prefs.favoredGenres?.includes(g));
    if (isFavored) optimism = Math.min(0.95, optimism + 0.15);
    const choiceRoll = ((i * 19 + title.id.charCodeAt(0) * 7) % 100) / 100;
    const choice = choiceRoll < optimism ? 'hit' : 'flop';

    // Confidence 55 - 95
    const confBase = Math.floor(55 + (((i * 23 + title.id.length * 29) % 38)));
    const confidence = Math.min(95, Math.max(55, confBase));

    // Backdate timestamp across 15 to 45 days ago, clustered organically
    const daysAgo = 3 + ((i * 7 + title.id.length * 11) % 38);
    const timestamp = new Date(nowMs - daysAgo * 86400 * 1000).toISOString();

    const reason = getReason(archetype, choice, i);

    const mockUser = { id: p.id, name: p.displayName, email: `${p.username}@cinepulse.seed` };
    await putForecast(mockUser, title.id, { choice, confidence, reason }, { timestamp, skipOpenCheck: true });
    totalForecastsSeeded++;

    // For 20% of participating personas, add an updated forecast 3-7 days later (first_submission=0)
    if (i % 5 === 0 && daysAgo > 10) {
      const updateDaysAgo = daysAgo - 6;
      const updateTimestamp = new Date(nowMs - updateDaysAgo * 86400 * 1000).toISOString();
      const updatedConf = Math.min(98, confidence + 5);
      const updatedReason = `${reason} (Tracking confirms updated presale acceleration).`;
      await putForecast(mockUser, title.id, { choice, confidence: updatedConf, reason: updatedReason }, { timestamp: updateTimestamp, skipOpenCheck: true });
    }
  }
}

console.log(`   ✔ Seeded ${totalForecastsSeeded} backdated forecasts across titles.`);

// 3. Seed Reviews & First-Impressions (Track K3)
console.log('\n3. Seeding reviews, first-impressions, comments, and likes...');

const REVIEW_TEXTS = [
  'A striking display of atmospheric tension and visual world-building. The sound design alone justifies the premium format ticket, even if the second act drags slightly in its exposition.',
  'Bold, kinetic, and completely unapologetic in its narrative momentum. The ensemble chemistry elevates every dialogue sequence into something genuinely captivating.',
  'Technically immaculate with gorgeous cinematography, though the narrative beats follow an overly familiar template. Still an undeniable crowd-pleaser on the big screen.',
  'An inventive high-concept premise executed with remarkable discipline. The third-act tonal shift will divide audiences, but the sheer ambition is worth celebrating.',
  'Visually breathtaking with practical stunts that remind you what cinema is meant to feel like. One of the sharpest original screenplays we have seen this season.',
  'A quiet triumph of mood and pacing. It dares to linger in the spaces between lines and trusts the audience to connect the emotional dots.'
];

let reviewCount = 0;
const seededReviewIds = [];

for (let i = 0; i < titles.length; i++) {
  const title = titles[i];
  // 3-4 reviews per title
  for (let j = 0; j < 4; j++) {
    const personaIdx = (i * 7 + j * 11) % personas.length;
    const persona = personas[personaIdx];
    const daysAgo = 2 + ((i * 5 + j * 9) % 30);
    const timestamp = new Date(nowMs - daysAgo * 86400 * 1000).toISOString();

    const body = REVIEW_TEXTS[(i + j) % REVIEW_TEXTS.length];
    const spoiler = (i + j) % 6 === 0;

    // Unreleased titles get rating = null (first-impression)
    // Past released titles get rating 1-5 biased by persona
    const isPast = title.releaseDate && title.releaseDate < new Date().toISOString().slice(0, 10);
    let rating = null;
    if (isPast) {
      const bias = persona.tastePreferences.ratingBias;
      rating = Math.max(1, Math.min(5, Math.round(3.5 + bias)));
    }

    const mockUser = { id: persona.id, name: persona.displayName, email: `${persona.username}@cinepulse.seed` };
    try {
      await putReview(mockUser, title.id, { body, rating, spoiler }, { timestamp });
      reviewCount++;

      const reviewRow = d.prepare('SELECT id FROM reviews WHERE user_id = ? AND title_id = ?').get(persona.id, title.id);
      if (reviewRow?.id) {
        seededReviewIds.push({ id: reviewRow.id, userId: persona.id, timestamp });
      }
    } catch {}
  }
}

console.log(`   ✔ Seeded ${reviewCount} reviews across catalog titles.`);

// Seed threaded comments on a subset of reviews
const COMMENT_REPLIES = [
  'Completely agree on the sound mix. In IMAX that opening sequence rattled my ribs.',
  'Interesting take, though I felt the third act was actually where everything clicked into place.',
  'Spot on observation. Curious if the second weekend box office hold will reflect this.',
  'The practical stunt work was so refreshing after a decade of green-screen exhaustion.',
  'Hard agree. That central performance alone is carrying the whole thematic weight.'
];

let commentCount = 0;
for (let i = 0; i < seededReviewIds.length && i < 15; i++) {
  const target = seededReviewIds[i];
  // 1-2 comments per selected review
  const commenterIdx = (i * 13 + 7) % personas.length;
  const commenter = personas[commenterIdx];
  if (commenter.id === target.userId) continue;

  const commentText = COMMENT_REPLIES[i % COMMENT_REPLIES.length];
  const commentTime = new Date(new Date(target.timestamp).getTime() + 4 * 3600 * 1000).toISOString();
  addComment(commenter.id, 'review', target.id, commentText, commentTime);
  commentCount++;
}

console.log(`   ✔ Seeded ${commentCount} threaded comments.`);

// Seed likes with power-law distribution
let likesCount = 0;
for (let i = 0; i < seededReviewIds.length; i++) {
  const target = seededReviewIds[i];
  // A few get 8-14 likes, most get 1-3
  const numLikes = (i % 4 === 0) ? 9 + (i % 6) : 1 + (i % 3);
  for (let l = 0; l < numLikes; l++) {
    const likerIdx = (i * 17 + l * 23) % personas.length;
    const liker = personas[likerIdx];
    if (liker.id === target.userId) continue;
    toggleLike(liker.id, 'review', target.id, true, target.timestamp);
    likesCount++;
  }
}

console.log(`   ✔ Seeded ${likesCount} likes across reviews.`);

// 4. Seed Follow Graph (Track K4)
console.log('\n4. Seeding follow graph among personas (power-law distribution)...');

let followCount = 0;
// Influential personas (top 5 get 12-18 followers)
const influencers = personas.slice(0, 5);
const regulars = personas.slice(5, 20);

for (const influencer of influencers) {
  // Followed by 12-16 other seed personas
  for (let i = 6; i < 22; i++) {
    const follower = personas[i];
    if (follower.id === influencer.id) continue;
    const fTime = new Date(nowMs - (20 + (i % 20)) * 86400 * 1000).toISOString();
    followUser(follower.id, influencer.username, fTime);
    followCount++;
  }
}

// Regular personas get 2-5 followers
for (const reg of regulars) {
  for (let i = 0; i < 3; i++) {
    const followerIdx = (personas.indexOf(reg) * 7 + i * 11) % personas.length;
    const follower = personas[followerIdx];
    if (follower.id === reg.id) continue;
    const fTime = new Date(nowMs - (10 + (i % 15)) * 86400 * 1000).toISOString();
    followUser(follower.id, reg.username, fTime);
    followCount++;
  }
}

console.log(`   ✔ Seeded ${followCount} follow relationships without touching real users.`);

// 5. Seed Leaderboard Entries (Track K5)
console.log('\n5. Seeding benchmark predictions and Brier score leaderboard entries...');

// Add 3 historical resolved predictions to predictions_log
const PAST_TITLES = [
  {
    id: 'demo-station',
    name: 'Station Nowhere',
    budget: 40_000_000,
    revenue: 118_000_000,
    actualHit: 1, // hit: revenue >= 2.5 * budget
    hitProb: 75,
    resolvedAt: new Date(nowMs - 45 * 86400 * 1000).toISOString()
  },
  {
    id: 'demo-neon',
    name: 'Neon Rain',
    budget: 80_000_000,
    revenue: 72_000_000,
    actualHit: 0,
    hitProb: 35,
    resolvedAt: new Date(nowMs - 60 * 86400 * 1000).toISOString()
  },
  {
    id: 'demo-glass',
    name: 'The Glass Orchard',
    budget: 22_000_000,
    revenue: 84_000_000,
    actualHit: 1,
    hitProb: 80,
    resolvedAt: new Date(nowMs - 30 * 86400 * 1000).toISOString()
  }
];

transaction(() => {
  for (const pt of PAST_TITLES) {
    d.prepare(`
      INSERT INTO predictions_log (
        id, title_id, title_name, model_version, predicted_revenue_p50,
        hit_probability, confidence, features_json, actual_revenue, actual_hit, resolved_at, created_at
      ) VALUES (?, ?, ?, 'cinepulse-v6-ridge-platt', ?, ?, 'high', '{}', ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        actual_revenue = excluded.actual_revenue,
        actual_hit = excluded.actual_hit,
        resolved_at = excluded.resolved_at
    `).run(
      `seed_log_${pt.id}`,
      pt.id,
      pt.name,
      pt.budget * 2,
      pt.hitProb,
      pt.revenue,
      pt.actualHit,
      pt.resolvedAt,
      pt.resolvedAt
    );

    // Also add forecasts for top 20 seed personas on these past titles
    for (let i = 0; i < 20; i++) {
      const p = personas[i];
      const isHit = (i % 3 !== 0) ? pt.actualHit === 1 : pt.actualHit === 0;
      const choice = isHit ? 'hit' : 'flop';
      const conf = 65 + (i % 25);
      const stamp = new Date(new Date(pt.resolvedAt).getTime() - 25 * 86400 * 1000).toISOString();

      d.prepare(`
        INSERT INTO forecasts (user_id, title_id, choice, confidence, reason, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'Historical benchmark seed call', ?, ?)
        ON CONFLICT(user_id, title_id) DO UPDATE SET choice=excluded.choice, confidence=excluded.confidence
      `).run(p.id, pt.id, choice, conf, stamp, stamp);
    }
  }
});

// Update Brier scores for these personas using official scoring function
let scoredPersonas = 0;
for (let i = 0; i < 20; i++) {
  const p = personas[i];
  updateUserBrierScore(p.id);
  scoredPersonas++;
}

console.log(`   ✔ Resolved historical forecasts and calculated Brier scores for ${scoredPersonas} personas.`);

console.log('\n✔ Synthetic community seeding complete!');
console.log('   - 50 Persona Accounts (is_seed=1)');
console.log(`   - ${totalForecastsSeeded} Backdated Forecasts with Organic Growth Curves`);
console.log(`   - ${reviewCount} Reviews and First-Impressions`);
console.log(`   - ${commentCount} Threaded Comments & ${likesCount} Likes`);
console.log(`   - ${followCount} Follow Graph Relationships`);
console.log(`   - ${scoredPersonas} Official Brier Score Leaderboard Entries`);
console.log('To wipe all synthetic data at any time, run: npm run unseed:community\n');
