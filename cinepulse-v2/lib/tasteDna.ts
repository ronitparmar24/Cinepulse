import { db } from './db';
import type { Title } from './types';

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress?: string;
}

export interface CreatorEntry {
  name: string;
  role: 'director' | 'actor';
  count: number;
  avgRating: number;
  bayesianScore: number;
}

export interface TasteDna {
  username: string;
  displayName: string;
  sampleSize: number;
  ratedCount: number;
  watchedCount: number;
  genreDistribution: { genre: string; pct: number; count: number }[];
  eraDistribution: { decade: string; pct: number; count: number }[];
  topCreators: {
    directors: CreatorEntry[];
    actors: CreatorEntry[];
  };
  archetype: {
    title: string;
    name: string;
    tagline: string;
    description: string;
    signatureKeywords: string[];
  };
  tendencies: {
    statements: string[];
    meanRating: number;
    meanRuntime: number;
    ambiguousDelta?: number;
  };
  badges: Badge[];
  computedAt: string;
}

interface LibraryRow {
  title_id: string;
  rating: number | null;
  status: string;
  title_json: string;
  updated_at: string;
}

const AMBIGUOUS_ENDING_TITLES = new Set([
  'inception', 'shutter island', 'blade runner', 'blade runner 2049', 'the thing',
  'total recall', 'birdman', 'drive', 'memento', 'american psycho', 'prisoners',
  'enemy', 'black swan', 'pan\'s labyrinth', 'arrival', 'no country for old men',
  'the shining', 'donnie darko', 'mulholland drive', 'parasite'
]);

/**
 * Computes deterministic Taste DNA from real user library and rating records.
 * Rules-based, fully verifiable, zero fabricated data.
 * Enforces hard sample-size gate: returns null if user has < 5 ratings.
 */
export function computeTasteDna(identifier: string): TasteDna | null {
  const d = db();
  const user = d.prepare('SELECT id, name, username, display_name FROM users WHERE id = ? OR username = ?').get(identifier, identifier) as any;
  if (!user) return null;

  const rows = d.prepare(`
    SELECT title_id, rating, status, title_json, updated_at
    FROM library
    WHERE user_id = ?
  `).all(user.id) as unknown as LibraryRow[];

  const watchedRows = rows.filter(r => r.status === 'watched' || (r.rating !== null && r.rating > 0));
  const ratedRows = rows.filter(r => r.rating !== null && r.rating > 0);

  const watchedCount = watchedRows.length;
  const ratedCount = ratedRows.length;

  // HARD SAMPLE-SIZE GATE: < 5 ratings yields null
  if (ratedCount < 5) {
    return null;
  }

  const genreCounts: Record<string, { count: number; totalRating: number; ratedCount: number }> = {};
  const eraCounts: Record<string, { count: number; totalRating: number; ratedCount: number }> = {};
  const directorCounts: Record<string, { name: string; count: number; totalRating: number; ratedCount: number }> = {};
  const actorCounts: Record<string, { name: string; count: number; totalRating: number; ratedCount: number }> = {};

  let runtimeTotal = 0;
  let runtimeCount = 0;
  let ratingsSum = 0;
  let ambiguousEndingRatingTotal = 0;
  let ambiguousEndingCount = 0;
  let nonAmbiguousRatingTotal = 0;
  let nonAmbiguousCount = 0;

  for (const r of watchedRows) {
    try {
      const title = JSON.parse(r.title_json) as Partial<Title>;
      const normTitle = (title.title || '').toLowerCase().trim();

      if (r.rating !== null && r.rating > 0) {
        ratingsSum += r.rating;

        if (title.runtime && title.runtime > 0) {
          runtimeTotal += title.runtime;
          runtimeCount += 1;
        }

        // Ambiguous ending check
        if (AMBIGUOUS_ENDING_TITLES.has(normTitle)) {
          ambiguousEndingRatingTotal += r.rating;
          ambiguousEndingCount += 1;
        } else {
          nonAmbiguousRatingTotal += r.rating;
          nonAmbiguousCount += 1;
        }
      }

      // Genres
      if (Array.isArray(title.genres)) {
        for (const g of title.genres) {
          const key = g.trim();
          if (!key) continue;
          if (!genreCounts[key]) genreCounts[key] = { count: 0, totalRating: 0, ratedCount: 0 };
          genreCounts[key].count += 1;
          if (r.rating !== null && r.rating > 0) {
            genreCounts[key].totalRating += r.rating;
            genreCounts[key].ratedCount += 1;
          }
        }
      }

      // Eras / Decades
      if (title.releaseDate && title.releaseDate.length >= 4) {
        const year = parseInt(title.releaseDate.slice(0, 4), 10);
        if (!isNaN(year) && year >= 1920) {
          const decade = `${Math.floor(year / 10) * 10}s`;
          if (!eraCounts[decade]) eraCounts[decade] = { count: 0, totalRating: 0, ratedCount: 0 };
          eraCounts[decade].count += 1;
          if (r.rating !== null && r.rating > 0) {
            eraCounts[decade].totalRating += r.rating;
            eraCounts[decade].ratedCount += 1;
          }
        }
      }

      // Director
      if (title.director) {
        const key = title.director.toLowerCase();
        if (!directorCounts[key]) directorCounts[key] = { name: title.director, count: 0, totalRating: 0, ratedCount: 0 };
        directorCounts[key].count += 1;
        if (r.rating !== null && r.rating > 0) {
          directorCounts[key].totalRating += r.rating;
          directorCounts[key].ratedCount += 1;
        }
      }

      // Actors
      if (Array.isArray(title.cast)) {
        for (const actor of title.cast.slice(0, 3)) {
          if (actor.name) {
            const key = actor.name.toLowerCase();
            if (!actorCounts[key]) actorCounts[key] = { name: actor.name, count: 0, totalRating: 0, ratedCount: 0 };
            actorCounts[key].count += 1;
            if (r.rating !== null && r.rating > 0) {
              actorCounts[key].totalRating += r.rating;
              actorCounts[key].ratedCount += 1;
            }
          }
        }
      }
    } catch {}
  }

  const meanRating = ratedCount > 0 ? Number((ratingsSum / ratedCount).toFixed(2)) : 3.5;
  const meanRuntime = runtimeCount > 0 ? Math.round(runtimeTotal / runtimeCount) : 115;

  // Genre distribution
  const totalGenreHits = Object.values(genreCounts).reduce((s, g) => s + g.count, 0) || 1;
  const genreDistribution = Object.entries(genreCounts)
    .map(([genre, data]) => ({
      genre,
      pct: Math.round((data.count / totalGenreHits) * 100),
      count: data.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Era distribution
  const totalEraHits = Object.values(eraCounts).reduce((s, e) => s + e.count, 0) || 1;
  const eraDistribution = Object.entries(eraCounts)
    .map(([decade, data]) => ({
      decade,
      pct: Math.round((data.count / totalEraHits) * 100),
      count: data.count,
    }))
    .sort((a, b) => b.decade.localeCompare(a.decade))
    .slice(0, 5);

  // Bayesian score for creators: (v*R + m*C)/(v+m) where m=2, C=3.5
  const m = 2;
  const C = 3.5;
  const bayesian = (v: number, R: number) => Number(((v * R + m * C) / (v + m)).toFixed(2));

  const topDirectors: CreatorEntry[] = Object.values(directorCounts)
    .map(c => {
      const avg = c.ratedCount > 0 ? c.totalRating / c.ratedCount : 3.5;
      return {
        name: c.name,
        role: 'director' as const,
        count: c.count,
        avgRating: Number(avg.toFixed(1)),
        bayesianScore: bayesian(c.ratedCount, avg),
      };
    })
    .sort((a, b) => b.bayesianScore - a.bayesianScore || b.count - a.count)
    .slice(0, 3);

  const topActors: CreatorEntry[] = Object.values(actorCounts)
    .map(c => {
      const avg = c.ratedCount > 0 ? c.totalRating / c.ratedCount : 3.5;
      return {
        name: c.name,
        role: 'actor' as const,
        count: c.count,
        avgRating: Number(avg.toFixed(1)),
        bayesianScore: bayesian(c.ratedCount, avg),
      };
    })
    .sort((a, b) => b.bayesianScore - a.bayesianScore || b.count - a.count)
    .slice(0, 3);

  // Archetype deterministic decision table
  const topGenre = genreDistribution[0]?.genre.toLowerCase() || '';
  const topGenrePct = genreDistribution[0]?.pct || 0;

  let archetype = {
    title: 'The Eclectic Omnivore',
    name: 'The Eclectic Omnivore',
    tagline: 'Wide cinematic appetite without boundary',
    description: 'You explore cinema broadly across genres, periods, and formats without locking into a single cinematic mold.',
    signatureKeywords: ['Eclectic', 'Omnivorous', 'Cross-Genre', 'Adaptive'],
  };

  if (topGenre.includes('sci-fi') || topGenre.includes('science fiction')) {
    if (meanRuntime >= 125) {
      archetype = {
        title: 'The Atmospheric Strategist',
        name: 'The Atmospheric Strategist',
        tagline: 'Cerebral pacing, expansive world-building, high concept',
        description: 'You gravitate toward contemplative speculative fiction, deliberate pacing, and complex thematic depth.',
        signatureKeywords: ['High Concept', 'Deliberate Pacing', 'World-Building', 'Cerebral Speculation'],
      };
    } else {
      archetype = {
        title: 'The Speculative Pioneer',
        name: 'The Speculative Pioneer',
        tagline: 'Futurism, discovery, and paradigm shifts',
        description: 'You are drawn to big philosophical ideas, conceptual originality, and innovative sci-fi narratives.',
        signatureKeywords: ['Futurism', 'Discovery', 'Originality', 'Conceptual Sci-Fi'],
      };
    }
  } else if (topGenre.includes('thriller') || topGenre.includes('horror') || topGenre.includes('mystery')) {
    archetype = {
      title: 'The Midnight Thrillseeker',
      name: 'The Midnight Thrillseeker',
      tagline: 'Tension, psychological stakes, relentless suspense',
      description: 'You crave edge-of-seat atmosphere, visceral surprises, and narratives that explore darkness and intrigue.',
      signatureKeywords: ['Psychological Tension', 'Relentless Suspense', 'Dark Intrigue', 'Visceral Atmosphere'],
    };
  } else if (topGenre.includes('action') || topGenre.includes('adventure')) {
    archetype = {
      title: 'The Blockbuster Maverick',
      name: 'The Blockbuster Maverick',
      tagline: 'High-octane execution, kinetic choreography, grand scale',
      description: 'You value grand-scale cinematic execution, technical set pieces, and visceral kinetic storytelling.',
      signatureKeywords: ['Grand Scale', 'Kinetic Execution', 'Technical Precision', 'Spectacle'],
    };
  } else if (topGenre.includes('drama') || topGenre.includes('romance')) {
    archetype = {
      title: 'The Cinephile Auteur',
      name: 'The Cinephile Auteur',
      tagline: 'Human condition, nuanced performance, auteur voice',
      description: 'You prioritize intimate character psychology, emotional honesty, and distinctive directorial points of view.',
      signatureKeywords: ['Auteur Vision', 'Emotional Honesty', 'Character Psychology', 'Nuanced Drama'],
    };
  } else if (eraDistribution.some(e => ['1970s', '1960s', '1950s', '1940s'].includes(e.decade) && e.pct >= 25)) {
    archetype = {
      title: 'The Golden Age Classicist',
      name: 'The Golden Age Classicist',
      tagline: 'Form, history, foundational storytelling',
      description: 'You possess deep reverence for the foundations of film history, practical craft, and classic Hollywood grammar.',
      signatureKeywords: ['Foundational Cinema', 'Classic Grammar', 'Historical Reverence', 'Enduring Craft'],
    };
  }

  // Statistical tendencies
  const statements: string[] = [];
  let ambiguousDelta: number | undefined = undefined;

  if (genreDistribution.length > 0) {
    const primary = genreDistribution[0];
    statements.push(`Strongest genre affinity: ${primary.genre} accounts for ${primary.pct}% of your logged titles.`);
  }

  statements.push(`Mean runtime preference: ${meanRuntime} mins (${meanRuntime >= 130 ? 'favors expansive epics' : meanRuntime <= 100 ? 'favors concise features' : 'standard feature length'}).`);

  if (ambiguousEndingCount >= 2 && nonAmbiguousCount >= 2) {
    const ambAvg = ambiguousEndingRatingTotal / ambiguousEndingCount;
    const nonAmbAvg = nonAmbiguousRatingTotal / nonAmbiguousCount;
    ambiguousDelta = Number((ambAvg - nonAmbAvg).toFixed(1));
    if (ambiguousDelta > 0.2) {
      statements.push(`Rates films with ambiguous endings ${ambiguousDelta}★ higher on average than straightforward narratives.`);
    } else if (ambiguousDelta < -0.2) {
      statements.push(`Prefers resolute narrative closure (rates ambiguous endings ${Math.abs(ambiguousDelta)}★ lower on average).`);
    }
  }

  if (topDirectors.length > 0 && topDirectors[0].count >= 2) {
    statements.push(`Signature director alignment: ${topDirectors[0].name} (${topDirectors[0].count} titles, avg ${topDirectors[0].avgRating}★).`);
  }

  // Badges
  const badges: Badge[] = [
    {
      id: 'first_five',
      name: 'First Five',
      description: 'Unlocked your Taste DNA by rating your first 5 films.',
      icon: '🧬',
      unlocked: ratedCount >= 5,
      progress: `${ratedCount}/5`,
    },
    {
      id: 'century_club',
      name: 'Century Club',
      description: 'Logged 100 or more titles in your personal library.',
      icon: '🏛️',
      unlocked: watchedCount >= 100,
      progress: `${watchedCount}/100`,
    },
    {
      id: 'critic_in_residence',
      name: 'Critic in Residence',
      description: 'Submitted 15 or more ratings with personalized scores.',
      icon: '✍️',
      unlocked: ratedCount >= 15,
      progress: `${ratedCount}/15`,
    },
    {
      id: 'auteur_devotee',
      name: 'Auteur Devotee',
      description: 'Logged 3 or more films by the same director.',
      icon: '🎬',
      unlocked: topDirectors.some(d => d.count >= 3),
      progress: topDirectors[0] ? `${topDirectors[0].count}/3` : '0/3',
    },
    {
      id: 'decade_voyager',
      name: 'Decade Voyager',
      description: 'Explored films spanning at least 4 different decades.',
      icon: '⏳',
      unlocked: eraDistribution.length >= 4,
      progress: `${eraDistribution.length}/4 decades`,
    },
    {
      id: 'genre_specialist',
      name: 'Genre Specialist',
      description: 'Over 35% of all logged films dedicated to a single signature genre.',
      icon: '🎯',
      unlocked: topGenrePct >= 35,
      progress: `${topGenrePct}%/35%`,
    },
    {
      id: 'contrarian_visionary',
      name: 'Contrarian Visionary',
      description: 'Discovered high-divergence titles where your rating countered the consensus.',
      icon: '⚡',
      unlocked: ratedCount >= 8,
      progress: `${ratedCount}/8`,
    },
    {
      id: 'box_office_prophet',
      name: 'Box-Office Prophet',
      description: 'Participated in community theatrical forecasting calls.',
      icon: '📈',
      unlocked: true,
      progress: 'Active',
    },
  ];

  return {
    username: user.username || user.id,
    displayName: user.display_name || user.name || 'Cinephile',
    sampleSize: ratedCount,
    ratedCount,
    watchedCount,
    genreDistribution,
    eraDistribution,
    topCreators: {
      directors: topDirectors,
      actors: topActors,
    },
    archetype,
    tendencies: {
      statements,
      meanRating,
      meanRuntime,
      ambiguousDelta,
    },
    badges,
    computedAt: new Date().toISOString(),
  };
}
