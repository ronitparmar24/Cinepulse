import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTasteDna } from '../lib/tasteDna';
import { db } from '../lib/db';
import { randomBytes } from 'node:crypto';

test('Taste DNA Engine - Deterministic Archetype and Empirical Stats', async (t) => {
  const d = db();
  const testUserId = `test-dna-user-${randomBytes(4).toString('hex')}`;
  const testUsername = `cinephile_${randomBytes(4).toString('hex')}`;

  // Insert test user
  d.prepare(`
    INSERT INTO users (id, name, email, username, password_hash, created_at)
    VALUES (?, ?, ?, ?, 'mock_hash_for_testing', datetime('now'))
  `).run(testUserId, 'Cinephile Tester', `${testUsername}@example.com`, testUsername);

  await t.test('User with 0 ratings receives null Taste DNA', () => {
    const dna = computeTasteDna(testUsername);
    assert.equal(dna, null);
  });

  await t.test('User with >= 5 ratings receives computed Taste DNA', () => {
    // Add 6 ratings with Sci-Fi, Thriller, High rating average
    const movies = [
      { id: 'm1', title: 'Blade Runner 2049', rating: 5, genres: ['Sci-Fi', 'Mystery'], director: 'Denis Villeneuve', runtime: 164 },
      { id: 'm2', title: 'Dune: Part Two', rating: 5, genres: ['Sci-Fi', 'Adventure'], director: 'Denis Villeneuve', runtime: 166 },
      { id: 'm3', title: 'Arrival', rating: 4.5, genres: ['Sci-Fi', 'Drama'], director: 'Denis Villeneuve', runtime: 116 },
      { id: 'm4', title: 'Sicario', rating: 4, genres: ['Action', 'Thriller'], director: 'Denis Villeneuve', runtime: 121 },
      { id: 'm5', title: 'Incendies', rating: 5, genres: ['Drama', 'Mystery'], director: 'Denis Villeneuve', runtime: 131 },
      { id: 'm6', title: 'Prisoners', rating: 4, genres: ['Thriller', 'Crime'], director: 'Denis Villeneuve', runtime: 153 },
    ];

    for (const m of movies) {
      d.prepare(`
        INSERT INTO library (user_id, title_id, status, rating, title_json, updated_at)
        VALUES (?, ?, 'watched', ?, ?, datetime('now'))
      `).run(
        testUserId,
        m.id,
        m.rating,
        JSON.stringify({
          id: m.id,
          title: m.title,
          genres: m.genres,
          director: m.director,
          runtime: m.runtime,
          voteAverage: 8.0,
          voteCount: 100000,
          releaseDate: '2020-01-01',
        })
      );
    }

    const dna = computeTasteDna(testUsername);
    assert.ok(dna, 'Taste DNA must be generated for >= 5 ratings');
    assert.equal(dna.sampleSize, 6);
    assert.equal(typeof dna.archetype.name, 'string');
    assert.equal(typeof dna.archetype.description, 'string');
    assert.ok(Array.isArray(dna.archetype.signatureKeywords));
    assert.ok(dna.tendencies.meanRating > 0);
    assert.ok(dna.topCreators.directors.length > 0);
    assert.equal(dna.topCreators.directors[0].name, 'Denis Villeneuve');
    assert.ok(dna.badges.some(b => b.id === 'first_five'));
  });
});
