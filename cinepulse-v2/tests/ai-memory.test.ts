import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from '../lib/db';
import { storeMemory, recall, checkConsistency } from '../lib/ai/memory';

test('Track T: Persona JSON exists, validates schema, and contains 30-40 souls', () => {
  const file = resolve(process.cwd(), 'data/ai-personas.json');
  assert(existsSync(file), 'data/ai-personas.json must exist');

  const content = JSON.parse(readFileSync(file, 'utf8'));
  assert(Array.isArray(content), 'Persona file must be an array');
  assert(content.length >= 30 && content.length <= 40, `Expected 30-40 personas, got ${content.length}`);

  const handles = new Set<string>();

  for (const p of content) {
    assert(p.id && p.id.startsWith('ai_persona_'), `Invalid ID: ${p.id}`);
    assert(p.identity, 'Must have identity block');
    assert(p.identity.handle, 'Must have handle');
    assert(!handles.has(p.identity.handle), `Duplicate handle: ${p.identity.handle}`);
    handles.add(p.identity.handle);

    assert(p.identity.displayName, 'Must have displayName');
    assert(p.identity.bio && p.identity.bio.length >= 10, 'Must have descriptive bio');
    assert(p.identity.avatarUrl.includes('dicebear.com'), 'Must use illustrated DiceBear avatar');
    assert.equal(p.identity.is_ai, 1);
    assert.equal(p.identity.is_seed, 1);

    // Voice block
    assert(Array.isArray(p.voice.sentenceLengthRange) && p.voice.sentenceLengthRange.length === 2);
    assert(typeof p.voice.emojiRate === 'number' && p.voice.emojiRate >= 0 && p.voice.emojiRate <= 1);
    assert(Array.isArray(p.voice.slang) && p.voice.slang.length >= 3);
    assert(Array.isArray(p.voice.signaturePhrases) && p.voice.signaturePhrases.length <= 3);

    // Taste block
    assert(Array.isArray(p.taste.latentVector) && p.taste.latentVector.length === 16, 'Must have k=16 latent vector');
    assert(Array.isArray(p.taste.favoriteDirectors) && p.taste.favoriteDirectors.length === 3);
    assert(Array.isArray(p.taste.petHateTropes) && p.taste.petHateTropes.length === 3);

    // Forecasting block
    assert(p.forecasting.skill >= 0.2 && p.forecasting.skill <= 0.9, 'Skill must be between 0.2 and 0.9');
    assert(typeof p.forecasting.contrarian === 'boolean');

    // Life block
    assert(p.life.backstory && !p.life.backstory.includes('Google') && !p.life.backstory.includes('Warner'), 'Backstory must not cite real employers');
  }
});

test('Track T: No two personas share a voice fingerprint (Jaccard similarity < 0.35)', () => {
  const file = resolve(process.cwd(), 'data/ai-personas.json');
  const personas = JSON.parse(readFileSync(file, 'utf8'));

  function getLexicon(p: any): Set<string> {
    const set = new Set<string>();
    for (const w of p.voice.slang) set.add(w.toLowerCase());
    for (const phrase of p.voice.signaturePhrases) {
      for (const word of phrase.toLowerCase().split(/\s+/)) {
        if (word.length > 3) set.add(word);
      }
    }
    return set;
  }

  function jaccard(s1: Set<string>, s2: Set<string>): number {
    let intersection = 0;
    for (const item of s1) {
      if (s2.has(item)) intersection++;
    }
    const union = s1.size + s2.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  for (let i = 0; i < personas.length; i++) {
    const lex1 = getLexicon(personas[i]);
    for (let j = i + 1; j < personas.length; j++) {
      const lex2 = getLexicon(personas[j]);
      const sim = jaccard(lex1, lex2);
      assert(sim < 0.35, `Personas ${personas[i].id} and ${personas[j].id} have high voice overlap: ${sim.toFixed(3)}`);
    }
  }
});

test('Track T: Memory storeMemory and recall() with recency decay', async () => {
  const d = db();
  const testPersona = 'ai_persona_test_mem';

  d.prepare("DELETE FROM ai_persona_memory WHERE persona_id = ?").run(testPersona);

  const nowMs = Date.now();
  const dateRecent = new Date(nowMs - 2 * 86400 * 1000).toISOString(); // 2 days ago
  const dateOld = new Date(nowMs - 45 * 86400 * 1000).toISOString();   // 45 days ago

  // Store memories
  await storeMemory(testPersona, 'opinion', 'Christopher Nolan', 'Master of practical scale and cinematic momentum', 1.0, dateRecent);
  await storeMemory(testPersona, 'opinion', 'Denis Villeneuve', 'Patient world-building and sensory sound design', 1.0, dateOld);
  await storeMemory(testPersona, 'grudge', 'Third-act CGI skybeam', 'Tired of glowing skybeams resolving dramatic conflict', 0.8, dateRecent);

  // Recall for Christopher Nolan
  const recalledNolan = await recall(testPersona, { director: 'Christopher Nolan' }, 3);
  assert(recalledNolan.length >= 1, 'Should recall Nolan memory');
  assert.equal(recalledNolan[0].subject, 'christopher nolan');
  assert(recalledNolan[0].score! > 0.8, 'Recent matching memory must have high score');

  // Recalling Villeneuve (45 days old) should have decayed score compared to recent
  const recalledVilleneuve = await recall(testPersona, { director: 'Denis Villeneuve' }, 3);
  assert(recalledVilleneuve.length >= 1);
  assert(recalledVilleneuve[0].score! < recalledNolan[0].score!, 'Old memory must have decayed relevance score');

  // Consistency guard test
  const checkOpposite = checkConsistency(testPersona, 'Christopher Nolan', 'negative');
  assert.equal(checkOpposite.allowed, false, 'Opposite opinion within 30 days should be rejected by consistency guard');
  assert(checkOpposite.rewrittenHint?.includes('Changed my mind'), 'Should offer rewritten hint');

  const checkSame = checkConsistency(testPersona, 'Christopher Nolan', 'positive');
  assert.equal(checkSame.allowed, true, 'Consistent opinion should be allowed');

  // Clean test memories
  d.prepare("DELETE FROM ai_persona_memory WHERE persona_id = ?").run(testPersona);
});
