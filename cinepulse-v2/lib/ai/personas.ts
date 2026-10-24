/**
 * CinePulse v9 — AI Personas Database Syncer & Loader
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from '../db';
import { hashPassword } from '../auth';

import defaultAiPersonas from '../../data/ai-personas.json';

let cachedPersonas: any[] | null = null;
let personaMap: Map<string, any> | null = null;

function setPersonasCache(personas: any[]): any[] {
  cachedPersonas = personas;
  personaMap = new Map();
  for (const p of personas) {
    if (p && p.id) {
      personaMap.set(p.id, p);
    }
  }
  return cachedPersonas;
}

export function loadAllAiPersonas(): any[] {
  if (cachedPersonas && cachedPersonas.length > 0) return cachedPersonas;
  try {
    const file = resolve(process.cwd(), 'data/ai-personas.json');
    if (existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return setPersonasCache(parsed);
      }
    }
  } catch {}

  if (Array.isArray(defaultAiPersonas) && defaultAiPersonas.length > 0) {
    return setPersonasCache(defaultAiPersonas as any[]);
  }

  return setPersonasCache([]);
}

export function getAiPersonaById(id: string): any | null {
  loadAllAiPersonas();
  return personaMap?.get(id) || null;
}

let cachedSeedHash: string | null = null;

/**
 * Ensures an AI persona has a valid user account in the users table with is_ai=1 and is_seed=1.
 */
export async function ensureAiPersonaUser(personaId: string): Promise<{ id: string; name: string }> {
  const d = db();
  const persona = getAiPersonaById(personaId);
  const displayName = persona?.identity?.displayName || `Pulse Critic ${personaId}`;
  const username = persona?.identity?.handle || personaId;
  const bio = persona?.identity?.bio || 'Simulated critic persona.';
  const avatarUrl = persona?.identity?.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`;

  if (!cachedSeedHash) {
    cachedSeedHash = await hashPassword('ai_persona_secret_seed');
  }

  d.prepare(`
    INSERT INTO users (
      id, name, email, password_hash, created_at, username, display_name, bio, avatar_url,
      profile_visibility, is_verified, is_seed, is_ai, ai_persona_id
    ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, 'public', 0, 1, 1, ?)
    ON CONFLICT(id) DO UPDATE SET
      is_ai = 1,
      ai_persona_id = excluded.ai_persona_id,
      display_name = excluded.display_name,
      username = excluded.username,
      avatar_url = excluded.avatar_url
  `).run(
    personaId,
    displayName,
    `${username}@cinepulse.ai`,
    cachedSeedHash,
    username,
    displayName,
    bio,
    avatarUrl,
    personaId
  );

  return { id: personaId, name: displayName };
}
