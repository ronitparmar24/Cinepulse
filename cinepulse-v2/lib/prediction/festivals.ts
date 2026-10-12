import releaseWindows from '../../data/release-windows.json';

export interface FestivalWindow {
  name: string;
  date: string;
  region: string;
  weight: number;
}

export interface NearestFestivalResult {
  festivalName: string | null;
  daysToNearestFestival: number | null;
  festivalWeight: number;
}

/**
 * Calculates days to nearest festival and corresponding weight for a given release date.
 * If release date is invalid or undefined, returns null days and 0 weight.
 */
export function getNearestFestival(releaseDate?: string | null): NearestFestivalResult {
  if (!releaseDate) {
    return { festivalName: null, daysToNearestFestival: null, festivalWeight: 0 };
  }

  const releaseMs = new Date(releaseDate).getTime();
  if (Number.isNaN(releaseMs)) {
    return { festivalName: null, daysToNearestFestival: null, festivalWeight: 0 };
  }

  let minDiffDays = Infinity;
  let chosenFestival: FestivalWindow | null = null;

  for (const festival of (releaseWindows as FestivalWindow[])) {
    const festMs = new Date(festival.date).getTime();
    const diffDays = Math.round(Math.abs(festMs - releaseMs) / (1000 * 60 * 60 * 24));

    if (diffDays < minDiffDays) {
      minDiffDays = diffDays;
      chosenFestival = festival;
    }
  }

  if (!chosenFestival) {
    return { festivalName: null, daysToNearestFestival: null, festivalWeight: 0 };
  }

  // Weight decays slightly if release is more than 14 days away from the festival
  let effectiveWeight = chosenFestival.weight;
  if (minDiffDays > 14) {
    effectiveWeight = Math.max(0, chosenFestival.weight * Math.exp(-(minDiffDays - 14) / 14));
  }

  return {
    festivalName: chosenFestival.name,
    daysToNearestFestival: minDiffDays,
    festivalWeight: Number(effectiveWeight.toFixed(2)),
  };
}
