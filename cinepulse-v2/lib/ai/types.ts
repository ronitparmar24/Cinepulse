/**
 * CinePulse v9 — Client-Safe AI Types & Constants
 */

export const CREW_QUESTIONS = [
  { key: 'hit_or_flop', label: 'Hit or Flop outlook?' },
  { key: 'theatre_worth', label: 'Worth seeing on the big screen?' },
  { key: 'best_comparison', label: 'What is this most comparable to?' }
];

export interface CrewTake {
  personaId: string;
  handle: string;
  displayName: string;
  avatarUrl: string;
  archetype: string;
  choice: 'hit' | 'flop';
  confidence: number;
  tasteMatchPercent?: number | null;
  take: string;
}

export interface AskTheCrewResponse {
  titleId: string;
  questionKey: string;
  questionText: string;
  takes: CrewTake[];
  cached: boolean;
}
