#!/usr/bin/env node
/**
 * CinePulse v7 — Persona Generation (Track J2)
 * Generates 40–60 synthetic personas stored in data/seed-personas.json.
 * Uses DiceBear avatars, film-twitter bios, distinct archetypes, taste preferences,
 * and transparent metadata markers. Works 100% offline with optional Gemini LLM enhancement.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const OUT_PATH = resolve(process.cwd(), 'data/seed-personas.json');

const ARCHETYPES = [
  'optimist',
  'contrarian',
  'genre-specialist:horror',
  'genre-specialist:scifi',
  'genre-specialist:action',
  'genre-specialist:drama',
  'casual',
  'lurker-who-rarely-votes'
];

const ARCHETYPE_CONFIGS = {
  'optimist': {
    ratingBias: 0.7,
    hitFlopOptimism: 0.82,
    activityLevel: 'high',
    favoredGenres: ['Adventure', 'Animation', 'Comedy', 'Action', 'Sci-Fi'],
    bioTemplates: [
      'Cinema is back. Every theatrical window is a reason to celebrate.',
      'Unabashed hype enthusiast. Give me practical stunts and a soaring score.',
      'Tracking box office multipliers with unbridled enthusiasm since 2017.',
      'If a trailer gives me goosebumps, I am seated opening night no questions asked.',
      'Rooting for every original sci-fi script to cross $400M worldwide.',
      'Always betting on the crowd showing up when the craft is there.',
      'Believer in big-screen spectacle and opening-weekend communal energy.',
      'Optimist by principle. Cinema will always find its audience.',
      'Long live the theatrical experience and oversized popcorn tubs.',
      'Here for maximalist auteur swings and historic opening runs.'
    ]
  },
  'contrarian': {
    ratingBias: -0.8,
    hitFlopOptimism: 0.22,
    activityLevel: 'high',
    favoredGenres: ['Drama', 'Thriller', 'Mystery', 'Crime'],
    bioTemplates: [
      'Contrarian by trade, festival skeptic by choice.',
      'If the third act relies on green screen and nostalgia bait, count me out.',
      'Tracking production budget bloat vs actual cultural footprint.',
      'Consensus is usually wrong and tracking metrics are heavily manipulated.',
      'Not convinced until the second weekend hold proves otherwise.',
      'The louder the marketing campaign, the flatter the screenplay.',
      'A24 skeptic. Show me an earned ending instead of ambient synth dread.',
      'Your favorite $200M tentpole has the cinematography of a car commercial.',
      'Skeptical of presale hype and manufactured Twitter reactions.',
      'Unimpressed by franchise fatigue dressed up as prestige world-building.'
    ]
  },
  'genre-specialist:horror': {
    ratingBias: 0.2,
    hitFlopOptimism: 0.65,
    activityLevel: 'medium',
    favoredGenres: ['Horror', 'Mystery', 'Thriller'],
    bioTemplates: [
      'Give me practical gore, midnight screenings, and tension you can choke on.',
      'Horror is the only genre keeping theatrical exhibition truly alive.',
      'Evaluating sound mix dynamics and atmospheric dread above all else.',
      'If it doesn’t leave the audience squirming in their seats, why bother?',
      'Devoted to low-budget genre miracles and inventive midnight discoveries.',
      'Blood, shadow play, and subverted survival tropes are my comfort food.',
      'Tracking Blumhouse ROI models and sleeper horror legs every autumn.',
      'A great jumpscare is physics; a great dread sequence is pure cinema.',
      'Found footage apologist and creature feature historian.',
      'Midnight festival programmer in spirit and horror purist by habit.'
    ]
  },
  'genre-specialist:scifi': {
    ratingBias: 0.3,
    hitFlopOptimism: 0.68,
    activityLevel: 'high',
    favoredGenres: ['Sci-Fi', 'Adventure', 'Mystery'],
    bioTemplates: [
      'If the sound design isn’t shaking the floorboards, don’t talk to me.',
      'Tracking 70mm IMAX prints and hard sci-fi world-building since 2014.',
      'Obsessed with scale, temporal paradoxes, and practical miniature work.',
      'Hard sci-fi adherent. Check your physics at the airlock.',
      'Give me brutalist spacecraft interiors and cosmic existential dread.',
      'Predicting box-office trajectories for high-concept original sci-fi.',
      'Seated front row center for any director who shoots on 65mm.',
      'Speculative fiction is where modern mythmaking actually happens.',
      'Here for soundstages that feel like industrial archaeology.',
      'Fascinated by high-concept gambles that defy focus-group smoothing.'
    ]
  },
  'genre-specialist:action': {
    ratingBias: 0.4,
    hitFlopOptimism: 0.72,
    activityLevel: 'high',
    favoredGenres: ['Action', 'Thriller', 'Crime', 'Adventure'],
    bioTemplates: [
      'Practical stunt coordination over CGI soup every single day.',
      'One clean tracking shot beats ten thousand jump cuts.',
      'Evaluating fight choreography with frame-by-frame precision.',
      'Tracking international box office appeal and IMAX pre-sale velocity.',
      'If the hero doesn’t reload on beat, the choreography is incomplete.',
      'Give me roaring engines, kinetic pacing, and crisp spatial geography.',
      'Action cinema is the purest form of visual storytelling.',
      'Stunt teams deserve an Academy Award category and everyone knows it.',
      'Here for visceral velocity and stuntmen throwing themselves down stairwells.',
      'Old school pyrotechnics and choreography that respects the wider lens.'
    ]
  },
  'genre-specialist:drama': {
    ratingBias: -0.1,
    hitFlopOptimism: 0.45,
    activityLevel: 'medium',
    favoredGenres: ['Drama', 'Romance', 'History'],
    bioTemplates: [
      'Two actors in a room with a brilliant script beats any multi-verse.',
      'Character-driven narratives and emotional resonance over visual noise.',
      'Tracking Venice, Cannes, and Telluride word-of-mouth momentum.',
      'Dialogue with rhythm, silences that breathe, and cinematography that listens.',
      'Looking for honest human conflict in an era of manufactured high concepts.',
      'Quiet devastation always outlasts loud spectacle.',
      'Prizing screenplays that dare to let a conversation carry the climax.',
      'Devoted to chamber dramas and bittersweet character studies.',
      'Give me natural lighting, subtle micro-expressions, and melancholic endings.',
      'The greatest special effect remains an actor’s eyes under close-up.'
    ]
  },
  'casual': {
    ratingBias: 0.3,
    hitFlopOptimism: 0.55,
    activityLevel: 'medium',
    favoredGenres: ['Comedy', 'Action', 'Drama', 'Adventure', 'Sci-Fi'],
    bioTemplates: [
      'Just love Friday night movies with friends and a giant soda.',
      'Here for entertaining stories and good vibes on the big screen.',
      'Catching whatever looks fun this weekend and voting on the outcome.',
      'Popcorn movie fan who occasionally gets dragged to arthouse gems.',
      'If it keeps me engaged for two hours, it gets a solid thumbs up.',
      'Weekend moviegoer following the buzz and testing my box office intuition.',
      'Keeping it simple: good pacing, memorable characters, fun ride.',
      'Casual viewer with strong opinions on sequel quality.',
      'Movie nights are sacred. Let’s see what sticks.',
      'Enjoying the ride and seeing how community calls match the reality.'
    ]
  },
  'lurker-who-rarely-votes': {
    ratingBias: 0.0,
    hitFlopOptimism: 0.50,
    activityLevel: 'rare',
    favoredGenres: ['Drama', 'Mystery'],
    bioTemplates: [
      'Observing the consensus from afar. Rarely votes, never forgets.',
      'Quiet watcher of box-office trends and audience sentiment shifts.',
      'Mostly here to read reviews and track prediction accuracy from the sidelines.',
      'Silent cinephile taking mental notes on opening weekend numbers.',
      'Lurking in the comments and watching the crowd consensus unfold.'
    ]
  }
};

const BASE_NAMES = [
  ['Priya', 'Kapoor', 'priya_k'],
  ['Dan', 'Mercer', 'filmnoir_dan'],
  ['Elena', 'Rostova', 'elena_r'],
  ['Marcus', 'Chen', 'marcus_c'],
  ['Sophie', 'Laurent', 'sophie_l'],
  ['Liam', 'O’Connor', 'liam_oc'],
  ['Amina', 'Diallo', 'amina_cinema'],
  ['Kenji', 'Takahashi', 'kenji_t'],
  ['Clara', 'Vogel', 'clara_v'],
  ['Mateo', 'Silva', 'mateo_s'],
  ['Zoe', 'Kovacs', 'zoe_k'],
  ['Tariq', 'Mansour', 'tariq_m'],
  ['Maya', 'Lin', 'maya_lin'],
  ['Julian', 'Frost', 'julian_f'],
  ['Freja', 'Lindstrom', 'freja_l'],
  ['Nikhil', 'Sharma', 'nikhil_s'],
  ['Carmen', 'Reyes', 'carmen_r'],
  ['Leo', 'Dubois', 'leo_dubois'],
  ['Ingrid', 'Berg', 'ingrid_b'],
  ['Arthur', 'Pendelton', 'arthur_p'],
  ['Fatima', 'Al-Sayed', 'fatima_as'],
  ['Ravi', 'Patel', 'ravi_patel'],
  ['Chloe', 'Bennett', 'chloe_b'],
  ['Dmitri', 'Ivanov', 'dmitri_i'],
  ['Hannah', 'Kim', 'hannah_kim'],
  ['Gabriel', 'Mendoza', 'gabe_m'],
  ['Nia', 'Abebe', 'nia_a'],
  ['Soren', 'Kierk', 'soren_k'],
  ['Tessa', 'Brooks', 'tessa_b'],
  ['Hugo', 'Valentin', 'hugo_v'],
  ['Mei', 'Zhang', 'mei_zhang'],
  ['Owen', 'Rhodes', 'owen_r'],
  ['Lucia', 'Moretti', 'lucia_m'],
  ['Zack', 'Fischer', 'zack_f'],
  ['Aaliyah', 'Khan', 'aaliyah_k'],
  ['Viktor', 'Novak', 'viktor_n'],
  ['Rowan', 'Kelly', 'rowan_k'],
  ['Samira', 'Joshi', 'samira_j'],
  ['Felix', 'Weber', 'felix_w'],
  ['Leila', 'Haddad', 'leila_h'],
  ['Bao', 'Nguyen', 'bao_nguyen'],
  ['Astrid', 'Nielsen', 'astrid_n'],
  ['Diego', 'Alvarez', 'diego_a'],
  ['Tara', 'Morrison', 'tara_m'],
  ['Kasper', 'Holm', 'kasper_h'],
  ['Sunita', 'Rao', 'sunita_r'],
  ['Ezra', 'Vance', 'ezra_v'],
  ['Mira', 'Sorvino', 'mira_film'],
  ['Gideon', 'Cross', 'gideon_c'],
  ['Rhea', 'Chakraborty', 'rhea_c']
];

export function generatePersonas(count = 50, force = false) {
  if (!force && existsSync(OUT_PATH)) {
    try {
      const existing = JSON.parse(readFileSync(OUT_PATH, 'utf-8'));
      if (Array.isArray(existing) && existing.length >= count) {
        console.log(`Using existing personas from ${OUT_PATH} (${existing.length} personas)`);
        return existing;
      }
    } catch {}
  }

  console.log(`Generating ${count} synthetic community personas...`);

  const personas = [];
  const archetypeList = [
    // 8 optimists
    ...Array(8).fill('optimist'),
    // 8 contrarians
    ...Array(8).fill('contrarian'),
    // 6 horror specialists
    ...Array(6).fill('genre-specialist:horror'),
    // 6 scifi specialists
    ...Array(6).fill('genre-specialist:scifi'),
    // 6 action specialists
    ...Array(6).fill('genre-specialist:action'),
    // 6 drama specialists
    ...Array(6).fill('genre-specialist:drama'),
    // 8 casuals
    ...Array(8).fill('casual'),
    // 2 lurkers
    ...Array(2).fill('lurker-who-rarely-votes')
  ];

  for (let i = 0; i < count; i++) {
    const [first, last, userSlug] = BASE_NAMES[i % BASE_NAMES.length];
    const username = `${userSlug}${i >= BASE_NAMES.length ? `_${Math.floor(i / BASE_NAMES.length) + 1}` : ''}`;
    const displayName = `${first} ${last}`;
    const archetype = archetypeList[i % archetypeList.length];
    const cfg = ARCHETYPE_CONFIGS[archetype];

    const bioIdx = i % cfg.bioTemplates.length;
    const bio = cfg.bioTemplates[bioIdx];

    // Placeholder avatar keyed by username (DiceBear avataaars/identicon)
    const avatarUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${username}`;

    personas.push({
      id: `seed_${username}`,
      username,
      displayName,
      bio,
      avatarUrl,
      archetype,
      tastePreferences: {
        favoredGenres: cfg.favoredGenres,
        ratingBias: cfg.ratingBias,
        hitFlopOptimism: cfg.hitFlopOptimism,
        activityLevel: cfg.activityLevel,
      },
      is_seed: 1,
      metadata: {
        is_synthetic_seed: true,
        archetype,
        generated_at: new Date().toISOString(),
        version: 'v7'
      }
    });
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(personas, null, 2), 'utf-8');
  console.log(`Saved ${personas.length} personas to ${OUT_PATH}`);
  return personas;
}

// Allow CLI execution: `node scripts/generate-personas.mjs [--force] [--count=50]`
if (process.argv[1] && process.argv[1].includes('generate-personas')) {
  const force = process.argv.includes('--force');
  const countArg = process.argv.find(a => a.startsWith('--count='));
  const count = countArg ? parseInt(countArg.split('=')[1], 10) : 50;
  generatePersonas(count, force);
}
