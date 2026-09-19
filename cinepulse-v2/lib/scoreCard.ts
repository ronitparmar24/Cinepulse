import { titleById, watchProviders } from './catalog';
import { getPulse } from './pulse';
import { getPrediction } from './prediction';
import { calculateTitleTasteMatch } from './tasteMatch';
import { formatBoxOfficeRange, SCORE_THRESHOLDS } from './scoreThresholds';
import type { User, Title, WatchProvider } from './types';

export interface ScoreCardData {
  titleId: string;
  title: Title;
  tasteMatch: {
    available: boolean;
    matchScore: number | null;
    reason?: string;
    sampleSize?: number;
    requiredSampleSize: number;
  };
  communityPulse: {
    available: boolean;
    totalCalls: number;
    hitPercentage: number | null;
    flopPercentage: number | null;
    statusText: string;
  };
  criticsTmdb: {
    voteAverage: number;
    voteCount: number;
    formattedScore: string;
  };
  boxOfficeForecast: {
    available: boolean;
    predictedGrossRange: string;
    pointEstimate: number;
    confidenceLevel: string;
    category: string;
  };
  streaming: {
    flatrate: WatchProvider[];
    rent: WatchProvider[];
    buy: WatchProvider[];
    link?: string | null;
  };
}

export async function getUnifiedScoreCard(
  titleId: string,
  viewer?: User | null
): Promise<ScoreCardData> {
  const title = await titleById(titleId);
  const providers = await watchProviders(titleId);
  const pulse = await getPulse(titleId, viewer || null);
  const prediction = await getPrediction(titleId, title);

  // 1. Taste Match gate (< 5 ratings -> hidden / not available)
  const taste = calculateTitleTasteMatch(viewer?.id || null, title);

  // 2. Community Pulse gate (< 10 calls -> "Not enough calls yet")
  const totalCalls = pulse.count || 0;
  const pulseAvailable = totalCalls >= SCORE_THRESHOLDS.MIN_COMMUNITY_CALLS_FOR_PULSE;
  const hitRatio = pulse.hitShare ?? (totalCalls > 0 ? Math.round((pulse.hit / totalCalls) * 100) : null);
  const flopRatio = hitRatio !== null ? 100 - hitRatio : null;

  // 3. Box Office Forecast (range representation, e.g. $185M–$215M)
  const p10 = prediction.p10RevenueUsd ?? (prediction.revenueRange ? prediction.revenueRange[0] : null);
  const p90 = prediction.p90RevenueUsd ?? (prediction.revenueRange ? prediction.revenueRange[1] : null);
  const boRange = formatBoxOfficeRange(p10, p90);

  const category = prediction.hitProbability >= 65
    ? 'Hit'
    : prediction.hitProbability <= 35
    ? 'Flop'
    : 'Moderate';

  return {
    titleId,
    title,
    tasteMatch: {
      available: taste.available,
      matchScore: taste.score,
      reason: taste.reason,
      sampleSize: taste.ratedCount,
      requiredSampleSize: SCORE_THRESHOLDS.MIN_RATINGS_FOR_TASTE_MATCH,
    },
    communityPulse: {
      available: pulseAvailable,
      totalCalls,
      hitPercentage: pulseAvailable ? hitRatio : null,
      flopPercentage: pulseAvailable ? flopRatio : null,
      statusText: pulseAvailable && hitRatio !== null ? `${hitRatio}% Call Hit` : 'Not enough calls yet',
    },
    criticsTmdb: {
      voteAverage: title.voteAverage ?? 0,
      voteCount: title.voteCount,
      formattedScore: title.voteAverage !== null && title.voteAverage !== undefined
        ? `${title.voteAverage.toFixed(1)} / 10`
        : 'Unrated',
    },
    boxOfficeForecast: {
      available: true,
      predictedGrossRange: boRange,
      pointEstimate: prediction.p50RevenueUsd ?? prediction.revenueEstimate ?? 0,
      confidenceLevel: prediction.confidence,
      category,
    },
    streaming: {
      flatrate: providers.flatrate || [],
      rent: providers.rent || [],
      buy: providers.buy || [],
      link: providers.link,
    },
  };
}
