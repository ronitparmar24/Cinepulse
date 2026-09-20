import type { TitleFeatureVector } from './features';

export interface WaterfallStep {
  name: string;
  deltaUsd: number;
  cumulativeUsd: number;
  impact: 'positive' | 'negative' | 'neutral';
  explanation: string;
}

export interface ModelExplanation {
  baseUsd: number;
  finalP50Usd: number;
  waterfall: WaterfallStep[];
  topDrivers: string[];
}

export function generateExplanation(
  features: TitleFeatureVector,
  baseUsd: number,
  p50Usd: number,
  genreMultiplier: number,
  seasonMultiplier: number,
  franchiseBoost: number,
  hypeMultiplier: number
): ModelExplanation {
  const waterfall: WaterfallStep[] = [];
  let current = baseUsd;

  // Step 1: Base
  waterfall.push({
    name: 'Historical Baseline',
    deltaUsd: baseUsd,
    cumulativeUsd: current,
    impact: 'neutral',
    explanation: 'Average theatrical industry gross for similar production scale.',
  });

  // Step 2: Budget Scale
  const budget = features.budgetUsd.value;
  if (budget && budget > 0) {
    const budgetDelta = Math.round(budget * 1.5 - baseUsd);
    current = Math.max(10_000_000, current + budgetDelta);
    waterfall.push({
      name: `Budget Tier (${features.budgetTier.value.toUpperCase()})`,
      deltaUsd: budgetDelta,
      cumulativeUsd: current,
      impact: budgetDelta >= 0 ? 'positive' : 'negative',
      explanation: `Production investment of $${(budget / 1e6).toFixed(0)}M sets theatrical distribution footprint.`,
    });
  }

  // Step 3: Genre Historical Multiplier
  const genreDelta = Math.round(current * (genreMultiplier - 1.0));
  current = Math.max(5_000_000, current + genreDelta);
  waterfall.push({
    name: `Genre (${features.primaryGenre.value})`,
    deltaUsd: genreDelta,
    cumulativeUsd: current,
    impact: genreDelta >= 0 ? 'positive' : 'negative',
    explanation: `${features.primaryGenre.value} theatrical multiplier of ${(genreMultiplier).toFixed(2)}x historically.`,
  });

  // Step 4: Franchise & IP Boost
  if (features.isFranchise.value) {
    const franchiseDelta = Math.round(current * (franchiseBoost - 1.0));
    current += franchiseDelta;
    waterfall.push({
      name: 'Franchise / Sequels Lift',
      deltaUsd: franchiseDelta,
      cumulativeUsd: current,
      impact: 'positive',
      explanation: 'Established cinematic IP generates built-in opening weekend floor.',
    });
  }

  // Step 5: Release Window (Seasonality)
  const seasonDelta = Math.round(current * (seasonMultiplier - 1.0));
  current = Math.max(5_000_000, current + seasonDelta);
  waterfall.push({
    name: features.isSummerWindow.value
      ? 'Summer Blockbuster Season'
      : features.isHolidayWindow.value
      ? 'Holiday Corridor'
      : 'Release Calendar Window',
    deltaUsd: seasonDelta,
    cumulativeUsd: current,
    impact: seasonDelta >= 0 ? 'positive' : 'negative',
    explanation: `Seasonal box-office distribution index (${seasonMultiplier.toFixed(2)}x).`,
  });

  // Step 6: Hype Velocity (Wikipedia + YouTube + Reddit)
  const hypeDelta = Math.round(current * (hypeMultiplier - 1.0));
  current = Math.max(5_000_000, current + hypeDelta);
  waterfall.push({
    name: 'Hype & Social Momentum',
    deltaUsd: hypeDelta,
    cumulativeUsd: current,
    impact: hypeDelta >= 0 ? 'positive' : 'negative',
    explanation: 'Pre-release Wikipedia pageviews, trailer view velocity, and Reddit sentiment.',
  });

  const topDrivers: string[] = [];
  if (features.isFranchise.value) topDrivers.push('Franchise IP Recognition');
  if (genreMultiplier >= 1.2) topDrivers.push(`Strong ${features.primaryGenre.value} Affinity`);
  if (seasonMultiplier > 1.1) topDrivers.push('Peak Holiday / Summer Release Date');
  if (hypeMultiplier > 1.05) topDrivers.push('High Pre-Release Search & Trailer Velocity');
  if (topDrivers.length === 0) topDrivers.push('Baseline Metadata Fit');

  return {
    baseUsd,
    finalP50Usd: p50Usd,
    waterfall,
    topDrivers,
  };
}
