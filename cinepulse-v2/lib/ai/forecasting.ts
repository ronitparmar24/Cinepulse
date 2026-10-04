/**
 * CinePulse v9 — Track U3: Persona Forecasting Engine
 * Evaluates calibrated hit/flop probabilities based on model predictions,
 * crowd sentiment, persona skill, optimism bias, herding, and contrarian stance.
 */

export interface ForecastingPersona {
  id: string;
  forecasting: {
    skill: number;
    optimism: number;
    herding: number;
    contrarian: boolean;
  };
  taste?: {
    latentVector?: number[];
  };
  voice?: {
    signaturePhrases?: string[];
  };
}

export interface PersonaForecastResult {
  choice: 'hit' | 'flop';
  confidence: number; // 50 to 95%
  probability: number; // 0.05 to 0.95
  rawScore: number;
  reason: string;
}

export function logit(p: number): number {
  const clamped = Math.max(0.005, Math.min(0.995, p));
  return Math.log(clamped / (1 - clamped));
}

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/**
 * Computes a persona's forecast prediction on an upcoming title.
 * P = sigmoid( skill * logit(modelProb) + optimism + genreAffinity + herding * effCrowdLogit + noise )
 */
export function computePersonaForecast(
  persona: ForecastingPersona,
  modelProb = 0.5,
  crowdProb = 0.5,
  genreAffinity = 0.0,
  noise = 0.0
): PersonaForecastResult {
  const skill = Math.max(0.1, Math.min(1.0, persona.forecasting.skill ?? 0.6));
  const optimism = persona.forecasting.optimism ?? 0.0;
  const herding = persona.forecasting.herding ?? 0.4;
  const isContrarian = Boolean(persona.forecasting.contrarian);

  const modelTerm = skill * logit(modelProb);

  // If crowd has no consensus (0.5), crowd term is zero
  const crowdLogit = logit(crowdProb);
  // Contrarians flip the crowd consensus
  const effCrowdTerm = isContrarian ? (-herding * crowdLogit) : (herding * crowdLogit);

  const z = modelTerm + optimism + (genreAffinity * 0.5) + effCrowdTerm + noise;
  const prob = Math.max(0.05, Math.min(0.95, sigmoid(z)));

  const choice: 'hit' | 'flop' = prob >= 0.5 ? 'hit' : 'flop';
  // Confidence is distance from 50%, mapped to [50, 95]
  const dist = Math.abs(prob - 0.5);
  const confidence = Math.round(50 + dist * 90);

  // Generate plausible explanation based on stance
  let reason = '';
  if (persona.voice?.signaturePhrases && persona.voice.signaturePhrases.length > 0) {
    reason = persona.voice.signaturePhrases[0];
  } else if (isContrarian) {
    reason = choice === 'hit'
      ? 'Underestimated pre-release awareness; counter-programming appeal is high.'
      : 'Crowd optimism is out of touch with market saturation and runtime drag.';
  } else {
    reason = choice === 'hit'
      ? 'Strong tracking signals and distribution leverage point to solid theatrical legs.'
      : 'Frontloaded initial buzz likely masking limited second-weekend retention.';
  }

  return {
    choice,
    confidence,
    probability: Number(prob.toFixed(4)),
    rawScore: Number(z.toFixed(4)),
    reason
  };
}
