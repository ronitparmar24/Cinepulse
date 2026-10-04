import type { Title } from './types';
import { formatInrCrores } from './currencyFormat';

export type MultiverseTimelineId =
  | 'prime'
  | 'viral_shockwave'
  | 'barbenheimer'
  | 'summer_bloodbath'
  | 'prestige_sleeper'
  | 'custom';

export interface MultiverseScenarioParams {
  budget: number; // in USD
  releaseCorridor: 'summer' | 'holiday' | 'fall_awards' | 'spring' | 'winter_dump';
  criticalScore: number; // 20 - 98 (%)
  marketingVelocity: number; // 0.5 - 5.0 (multiplier)
  theatricalWindow: 17 | 30 | 45 | 90; // days
  screenSaturation: 'imax_solo' | 'shared_wide' | 'squeezed';
}

export interface WeeklyTrajectoryPoint {
  week: number;
  weekendGross: number; // Weekend box office USD
  dropPercent: number; // percentage drop compared to previous weekend (0 for week 1)
  cumulativeGross: number; // Total worldwide gross through this week
}

export interface MultiverseSimulationResult {
  timelineId: MultiverseTimelineId;
  timelineName: string;
  tagline: string;
  params: MultiverseScenarioParams;
  trajectory: WeeklyTrajectoryPoint[];
  worldwideGross: number;
  p10: number; // Downside floor
  p50: number; // Median projection
  p90: number; // Upside ceiling
  breakEvenThreshold: number; // 2.5x budget
  breakEvenWeek: number | null; // Week number when break-even is crossed, or null if never
  netRoiPercent: number;
  hitProbability: number; // 0 - 100%
  verdict: 'phenomenon' | 'profitable_hit' | 'marginal_survivor' | 'write_down_casualty';
  verdictLabel: string;
  executiveBrief: {
    headline: string;
    summary: string;
    tactics: { title: string; detail: string }[];
  };
}

export interface MultiversePreset {
  id: MultiverseTimelineId;
  name: string;
  shortLabel: string;
  icon: string;
  tagline: string;
  description: string;
  color: string;
  params: (baseBudget: number) => MultiverseScenarioParams;
}

export const MULTIVERSE_PRESETS: MultiversePreset[] = [
  {
    id: 'prime',
    name: 'Earth-616: Prime Timeline',
    shortLabel: 'Prime Reality',
    icon: '🌌',
    tagline: 'Algorithmic baseline tracking',
    description: 'Current real-world tracking, baseline studio budget, and standard release corridor.',
    color: '#38bdf8', // sky-400
    params: (baseBudget: number) => ({
      budget: baseBudget,
      releaseCorridor: 'summer',
      criticalScore: 72,
      marketingVelocity: 1.0,
      theatricalWindow: 45,
      screenSaturation: 'shared_wide',
    }),
  },
  {
    id: 'viral_shockwave',
    name: 'Earth-Prime: Cultural Shockwave',
    shortLabel: 'Viral Phenomenon',
    icon: '⚡',
    tagline: 'Organic meme momentum & breakout hype',
    description: 'Explosive TikTok virality, high multiplier legs, and unprecedented social buzz expansion.',
    color: '#a855f7', // purple-500
    params: (baseBudget: number) => ({
      budget: baseBudget,
      releaseCorridor: 'summer',
      criticalScore: 89,
      marketingVelocity: 3.2,
      theatricalWindow: 90,
      screenSaturation: 'imax_solo',
    }),
  },
  {
    id: 'barbenheimer',
    name: 'Earth-Two: Counter-Programming Clash',
    shortLabel: 'The Barbenheimer Synergy',
    icon: '🥊',
    tagline: 'Paired cultural event with a rival tentpole',
    description: 'Opens head-to-head with an 800-lb blockbuster, capturing neglected demographics and meme crossover.',
    color: '#ec4899', // pink-500
    params: (baseBudget: number) => ({
      budget: Math.round(baseBudget * 0.9),
      releaseCorridor: 'holiday',
      criticalScore: 84,
      marketingVelocity: 2.4,
      theatricalWindow: 45,
      screenSaturation: 'shared_wide',
    }),
  },
  {
    id: 'summer_bloodbath',
    name: 'Earth-Three: Cannibalized Bloodbath',
    shortLabel: 'Screen Bloodbath',
    icon: '🩸',
    tagline: 'Crowded corridor screen squeeze',
    description: 'Squeezed between two giant franchise releases; loses premium IMAX screens in Week 2.',
    color: '#ef4444', // red-500
    params: (baseBudget: number) => ({
      budget: Math.round(baseBudget * 1.25),
      releaseCorridor: 'summer',
      criticalScore: 48,
      marketingVelocity: 0.9,
      theatricalWindow: 30,
      screenSaturation: 'squeezed',
    }),
  },
  {
    id: 'prestige_sleeper',
    name: 'Earth-Four: Prestige Academy Run',
    shortLabel: 'Prestige Sleeper',
    icon: '🏆',
    tagline: 'Fall festival critical acclaim & slow burn',
    description: 'Platform rollout, 95% critical consensus, low marketing waste, holding steady over 10 weeks.',
    color: '#eab308', // yellow-500
    params: (baseBudget: number) => ({
      budget: Math.max(15_000_000, Math.round(baseBudget * 0.6)),
      releaseCorridor: 'fall_awards',
      criticalScore: 94,
      marketingVelocity: 1.4,
      theatricalWindow: 90,
      screenSaturation: 'shared_wide',
    }),
  },
];

/**
 * Simulate 10-week box office progression given title details and multiverse scenario levers.
 */
export function simulateMultiverseTrajectory(
  title: Title,
  params: MultiverseScenarioParams,
  timelineId: MultiverseTimelineId = 'custom'
): MultiverseSimulationResult {
  const budget = Math.max(5_000_000, params.budget);
  const breakEvenThreshold = Math.round(budget * 2.5);

  // Corridor multiplier on opening weekend
  const corridorMultipliers = {
    summer: 1.25,
    holiday: 1.35,
    fall_awards: 0.85,
    spring: 1.05,
    winter_dump: 0.65,
  };
  const corridorMult = corridorMultipliers[params.releaseCorridor] || 1.0;

  // Screen saturation impact on opening weekend
  const screenMultipliers = {
    imax_solo: 1.3,
    shared_wide: 1.0,
    squeezed: 0.75,
  };
  const screenMult = screenMultipliers[params.screenSaturation] || 1.0;

  // Calculate opening weekend (Week 1 domestic/base)
  // Baseline opening is roughly proportional to budget^0.75 * marketing velocity * corridor * screen
  const baseBudgetFactor = Math.pow(budget / 10_000_000, 0.72) * 12_500_000;
  const initialHypeFactor = Math.min(2.5, Math.max(0.6, params.marketingVelocity));
  const week1Weekend = Math.round(baseBudgetFactor * initialHypeFactor * corridorMult * screenMult);

  // Determine weekly hold / drop curve based on criticalScore, theatrical window, and corridor
  // High criticalScore (85+) -> low drops (35-42%)
  // Low criticalScore (<50) -> steep drops (60-72%)
  const critFactor = (100 - params.criticalScore) / 100; // 0.05 for 95%, 0.7 for 30%
  const baseWeek2Drop = 0.35 + critFactor * 0.35; // 0.37 to 0.60

  const trajectory: WeeklyTrajectoryPoint[] = [];
  let currentWeekend = week1Weekend;
  let cumulativeGross = Math.round(week1Weekend * 2.2); // Week 1 total worldwide (weekend + weekdays + intl launch)
  let breakEvenWeek: number | null = cumulativeGross >= breakEvenThreshold ? 1 : null;

  trajectory.push({
    week: 1,
    weekendGross: week1Weekend,
    dropPercent: 0,
    cumulativeGross,
  });

  for (let w = 2; w <= 10; w++) {
    // Drop calculation: Week 2 is most sensitive; later weeks stabilize around 32-45%
    let weekDrop: number;
    if (w === 2) {
      weekDrop = baseWeek2Drop;
      if (params.theatricalWindow <= 17) weekDrop += 0.12; // PVOD cannibalization
      if (timelineId === 'viral_shockwave') weekDrop = 0.18; // rare viral hold
    } else {
      weekDrop = 0.32 + critFactor * 0.18 + (w > 6 ? 0.08 : 0);
    }
    weekDrop = Math.min(0.78, Math.max(0.12, weekDrop));

    currentWeekend = Math.round(currentWeekend * (1 - weekDrop));
    // Weekly worldwide contribution (weekend + weekdays + rolling intl)
    const weeklyTotal = Math.round(currentWeekend * (w <= 4 ? 2.0 : 1.7));
    cumulativeGross += weeklyTotal;

    if (!breakEvenWeek && cumulativeGross >= breakEvenThreshold) {
      breakEvenWeek = w;
    }

    trajectory.push({
      week: w,
      weekendGross: currentWeekend,
      dropPercent: Math.round(weekDrop * 100),
      cumulativeGross,
    });
  }

  const worldwideGross = cumulativeGross;
  const p10 = Math.round(worldwideGross * 0.72);
  const p50 = worldwideGross;
  const p90 = Math.round(worldwideGross * 1.38);

  const netRoiPercent = Math.round(((worldwideGross - breakEvenThreshold) / breakEvenThreshold) * 100);

  // Platt-scaled hit probability
  const ratio = worldwideGross / breakEvenThreshold;
  // Logistic function centered at ratio = 1.0
  const hitProbability = Math.min(99, Math.max(1, Math.round((1 / (1 + Math.exp(-4.2 * (ratio - 0.95)))) * 100)));

  // Verdict classification
  let verdict: MultiverseSimulationResult['verdict'];
  let verdictLabel: string;
  if (ratio >= 2.0 && hitProbability >= 90) {
    verdict = 'phenomenon';
    verdictLabel = 'CERTIFIED CULTURAL PHENOMENON';
  } else if (ratio >= 1.05) {
    verdict = 'profitable_hit';
    verdictLabel = 'STUDIO PROFIT HARVESTER';
  } else if (ratio >= 0.82) {
    verdict = 'marginal_survivor';
    verdictLabel = 'MARGINAL BREAK-EVEN BORDERLINE';
  } else {
    verdict = 'write_down_casualty';
    verdictLabel = 'HIGH WRITE-DOWN HAZARD';
  }

  // Executive briefing generator
  const executiveBrief = generateExecutiveBrief(title, params, worldwideGross, breakEvenThreshold, ratio, hitProbability, breakEvenWeek);

  const preset = MULTIVERSE_PRESETS.find(p => p.id === timelineId);

  return {
    timelineId,
    timelineName: preset ? preset.name : 'Custom Multiverse Sandbox',
    tagline: preset ? preset.tagline : 'Custom studio parameter tuning',
    params,
    trajectory,
    worldwideGross,
    p10,
    p50,
    p90,
    breakEvenThreshold,
    breakEvenWeek,
    netRoiPercent,
    hitProbability,
    verdict,
    verdictLabel,
    executiveBrief,
  };
}

function generateExecutiveBrief(
  title: Title,
  params: MultiverseScenarioParams,
  gross: number,
  breakEven: number,
  ratio: number,
  prob: number,
  breakEvenWeek: number | null
): MultiverseSimulationResult['executiveBrief'] {
  const isHit = ratio >= 1.0;
  const budgetM = Math.round(params.budget / 1_000_000);
  const grossM = Math.round(gross / 1_000_000);
  const breakEvenM = Math.round(breakEven / 1_000_000);

  let headline: string;
  let summary: string;

  if (ratio >= 1.8) {
    headline = `Greenlight with Full Theatrical Priority ($${grossM}M WW Target)`;
    headline = `Greenlight Priority: Massive $${grossM}M Target (+$${grossM - breakEvenM}M Net Spread)`;
    summary = `With ${params.criticalScore}% critical reception and ${params.marketingVelocity}x viral velocity, ${title.title} comfortably clears its $${breakEvenM}M break-even hurdle by Week ${breakEvenWeek || 2}. Theatrical legs are propelled by word-of-mouth endurance.`;
  } else if (isHit) {
    headline = `Conditional Greenlight: Maintain Strict $${budgetM}M Ceiling`;
    summary = `Projected at $${grossM}M worldwide vs a $${breakEvenM}M break-even threshold (${prob}% hit confidence). Margin for error is moderate; avoid marketing overspend and ensure a protected theatrical exclusivity corridor.`;
  } else {
    headline = `Executive Red Flag: $${breakEvenM - grossM}M Projected Theatrical Shortfall`;
    summary = `Under current parameters (${params.releaseCorridor.replace('_', ' ')} window, ${params.criticalScore}% score), projected box office ($${grossM}M) fails to clear the $${breakEvenM}M break-even bar. Immediate adjustments to budget or release date are required.`;
  }

  const tactics = [
    {
      title: 'Windowing & Exclusivity',
      detail:
        params.theatricalWindow >= 45
          ? `45+ day theatrical exclusive protects exhibitor goodwill and builds word-of-mouth before PVOD.`
          : `Fast-track 17-30d PVOD window reduces theatrical tail by ~15-20%, risking exhibitor boycotts on premium screens.`,
    },
    {
      title: 'Corridor Optimization',
      detail:
        params.releaseCorridor === 'summer' || params.releaseCorridor === 'holiday'
          ? `High-traffic tentpole corridor provides massive opening runway, provided premium PLF screens are locked.`
          : `Counter-programming or fall corridor preserves screens against superhero tentpoles, enhancing late multiplier legs.`,
    },
    {
      title: 'Critical Reception Threshold',
      detail:
        params.criticalScore >= 80
          ? `High critical consensus (${params.criticalScore}%) dampens Week 2 drops to under 40%, safeguarding long-term ROI.`
          : `Sub-70% critical reception triggers aggressive 55%+ second-week drops; requires front-loaded promotional blitz.`,
    },
  ];

  return { headline, summary, tactics };
}
