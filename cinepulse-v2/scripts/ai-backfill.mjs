#!/usr/bin/env node
/**
 * CinePulse v9 — AI Community Historical Backfill (Track X)
 * Populates organic historical AI critic activity backdated across N days.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, transaction, now } from '../lib/db.ts';
import { ensureAiPersonaUser } from '../lib/ai/personas.ts';
import { putForecast } from '../lib/pulse.ts';
import { putReview } from '../lib/reviews.ts';
import { storeMemory } from '../lib/ai/memory.ts';

const args = process.argv.slice(2);
let daysBack = 45;
const daysIdx = args.indexOf('--days');
if (daysIdx !== -1 && args[daysIdx + 1]) {
  daysBack = parseInt(args[daysIdx + 1], 10) || 45;
}

console.log(`─── CinePulse AI Community Backfill (${daysBack} days) ──────────────`);

const d = db();
const personasPath = resolve(process.cwd(), 'data/ai-personas.json');
if (!existsSync(personasPath)) {
  console.error('✖ Missing data/ai-personas.json. Run node scripts/generate-ai-personas.mjs first.');
  process.exit(1);
}

const personas = JSON.parse(readFileSync(personasPath, 'utf8'));
const catalogRaw = JSON.parse(readFileSync(resolve(process.cwd(), 'lib/demo-catalog.json'), 'utf8'));

let backfillForecasts = 0;
let backfillReviews = 0;

for (let i = 0; i < Math.min(20, personas.length); i++) {
  const p = personas[i];
  await ensureAiPersonaUser(p.id);

  // Distribute calls over the past daysBack days
  for (let j = 0; j < catalogRaw.length; j++) {
    const item = catalogRaw[j];
    const titleId = `demo-${item[0]}`;
    const titleName = item[1];
    const director = item[8];
    const genres = item[3];

    const offsetDays = Math.max(1, Math.floor(((i * 7 + j * 13) % daysBack)));
    const actionDate = new Date(Date.now() - offsetDays * 86400 * 1000).toISOString();

    const userObj = { id: p.id, name: p.identity.displayName };

    try {
      await putForecast(
        userObj,
        titleId,
        {
          choice: ((i + j) % 3 === 0) ? 'flop' : 'hit',
          confidence: 60 + ((i * 5) % 30),
          reason: p.voice?.signaturePhrases?.[0] || 'Historical release calibration.'
        },
        { timestamp: actionDate, skipOpenCheck: true }
      );
      backfillForecasts++;
    } catch {}

    // Add backdated review for released or historical titles
    if (j % 2 === 0) {
      try {
        await putReview(
          userObj,
          titleId,
          {
            body: `${titleName} provides a clear reflection of ${director}'s directorial choices. ${p.voice?.signaturePhrases?.[1] || ''}`,
            rating: null, // First-impression on unreleased
            spoiler: false
          },
          { timestamp: actionDate }
        );
        backfillReviews++;

        await storeMemory(
          p.id,
          'opinion',
          director || titleName,
          `Initial take on ${titleName}`,
          1.0,
          actionDate
        );
      } catch {}
    }

    // Log to activity log
    d.prepare(`
      INSERT INTO ai_activity_log (
        tick_id, persona_id, action, target_id, reason_code, provider, model, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'backfill',
      p.id,
      'forecast',
      titleId,
      'HISTORICAL_BACKFILL',
      'template',
      'template-v9',
      actionDate
    );
  }
}

console.log(`✔ Backfill complete:`);
console.log(`   - Backfilled forecasts: ${backfillForecasts}`);
console.log(`   - Backfilled reviews:   ${backfillReviews}`);
