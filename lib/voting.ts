export interface BordaVote {
  voterId: string;
  ranking: string[]; // Ordered from highest preference (rank 1) to lowest
}

export interface ApprovalVote {
  voterId: string;
  approvals: string[]; // Unordered list of approved candidate IDs
}

export interface RankedScore {
  candidateId: string;
  score: number;
  rank: number;
  firstPlaceVotes: number;
  approvalCount: number;
}

export interface TallyResult {
  winner: string | null;
  scores: RankedScore[];
  totalVoters: number;
  method: 'borda' | 'approval';
}

/**
 * Tally votes using the Borda count method.
 * For N total candidates:
 * A voter's 1st choice gets N-1 points, 2nd choice gets N-2 points, etc.
 * Unranked candidates receive 0 points.
 *
 * Tie-breaker:
 * 1. Higher number of 1st-place votes.
 * 2. Deterministic secondary sort (alphabetical candidateId).
 */
export function tallyBorda(candidates: string[], votes: BordaVote[]): TallyResult {
  if (candidates.length === 0) {
    return { winner: null, scores: [], totalVoters: votes.length, method: 'borda' };
  }

  const N = candidates.length;
  const scoreMap = new Map<string, number>();
  const firstPlaceMap = new Map<string, number>();

  for (const c of candidates) {
    scoreMap.set(c, 0);
    firstPlaceMap.set(c, 0);
  }

  for (const vote of votes) {
    const seen = new Set<string>();
    vote.ranking.forEach((candidateId, idx) => {
      if (!scoreMap.has(candidateId) || seen.has(candidateId)) return;
      seen.add(candidateId);

      const points = Math.max(0, N - 1 - idx);
      scoreMap.set(candidateId, (scoreMap.get(candidateId) ?? 0) + points);

      if (idx === 0) {
        firstPlaceMap.set(candidateId, (firstPlaceMap.get(candidateId) ?? 0) + 1);
      }
    });
  }

  const sortedCandidates = [...candidates].sort((a, b) => {
    const scoreDiff = (scoreMap.get(b) ?? 0) - (scoreMap.get(a) ?? 0);
    if (scoreDiff !== 0) return scoreDiff;

    const firstDiff = (firstPlaceMap.get(b) ?? 0) - (firstPlaceMap.get(a) ?? 0);
    if (firstDiff !== 0) return firstDiff;

    return a.localeCompare(b);
  });

  const scores: RankedScore[] = sortedCandidates.map((candidateId, index) => ({
    candidateId,
    score: scoreMap.get(candidateId) ?? 0,
    rank: index + 1,
    firstPlaceVotes: firstPlaceMap.get(candidateId) ?? 0,
    approvalCount: 0
  }));

  return {
    winner: scores.length > 0 ? scores[0].candidateId : null,
    scores,
    totalVoters: votes.length,
    method: 'borda'
  };
}

/**
 * Tally votes using Approval Voting.
 * Each approved candidate gets 1 point.
 *
 * Tie-breaker:
 * Deterministic alphabetical candidateId.
 */
export function tallyApproval(candidates: string[], votes: ApprovalVote[]): TallyResult {
  if (candidates.length === 0) {
    return { winner: null, scores: [], totalVoters: votes.length, method: 'approval' };
  }

  const approvalMap = new Map<string, number>();
  for (const c of candidates) {
    approvalMap.set(c, 0);
  }

  for (const vote of votes) {
    const seen = new Set<string>();
    for (const candidateId of vote.approvals) {
      if (!approvalMap.has(candidateId) || seen.has(candidateId)) continue;
      seen.add(candidateId);
      approvalMap.set(candidateId, (approvalMap.get(candidateId) ?? 0) + 1);
    }
  }

  const sortedCandidates = [...candidates].sort((a, b) => {
    const diff = (approvalMap.get(b) ?? 0) - (approvalMap.get(a) ?? 0);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });

  const scores: RankedScore[] = sortedCandidates.map((candidateId, index) => ({
    candidateId,
    score: approvalMap.get(candidateId) ?? 0,
    rank: index + 1,
    firstPlaceVotes: 0,
    approvalCount: approvalMap.get(candidateId) ?? 0
  }));

  return {
    winner: scores.length > 0 ? scores[0].candidateId : null,
    scores,
    totalVoters: votes.length,
    method: 'approval'
  };
}
