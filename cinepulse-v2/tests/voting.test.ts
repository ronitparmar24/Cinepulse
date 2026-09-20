import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tallyBorda, tallyApproval } from '../lib/voting';

test('tallyBorda correctly scores and ranks candidates with Borda count', () => {
  const candidates = ['m1', 'm2', 'm3'];
  // 3 candidates: 1st choice gets 2 pts, 2nd gets 1 pt, 3rd gets 0 pts
  const votes = [
    { voterId: 'alice', ranking: ['m1', 'm2', 'm3'] }, // m1: 2, m2: 1, m3: 0
    { voterId: 'bob', ranking: ['m2', 'm1', 'm3'] },   // m2: 2, m1: 1, m3: 0
    { voterId: 'charlie', ranking: ['m1', 'm3', 'm2'] } // m1: 2, m3: 1, m2: 0
  ];
  // Totals:
  // m1: 2 + 1 + 2 = 5 (two 1st-place votes)
  // m2: 1 + 2 + 0 = 3 (one 1st-place vote)
  // m3: 0 + 0 + 1 = 1 (zero 1st-place votes)

  const result = tallyBorda(candidates, votes);
  assert.equal(result.winner, 'm1');
  assert.equal(result.totalVoters, 3);
  assert.equal(result.scores[0].candidateId, 'm1');
  assert.equal(result.scores[0].score, 5);
  assert.equal(result.scores[0].firstPlaceVotes, 2);
  assert.equal(result.scores[1].candidateId, 'm2');
  assert.equal(result.scores[1].score, 3);
  assert.equal(result.scores[2].candidateId, 'm3');
  assert.equal(result.scores[2].score, 1);
});

test('tallyBorda breaks ties with first-place votes, then alphabetical fallback', () => {
  const candidates = ['m1', 'm2', 'm3'];
  // m1 and m2 end with same score, but m1 has more 1st place votes
  const votes = [
    { voterId: 'v1', ranking: ['m1', 'm3', 'm2'] }, // m1: 2, m3: 1, m2: 0
    { voterId: 'v2', ranking: ['m2', 'm1', 'm3'] }, // m2: 2, m1: 1, m3: 0
    { voterId: 'v3', ranking: ['m3', 'm2', 'm1'] }  // m3: 2, m2: 1, m1: 0
  ];
  // m1: 2 + 1 + 0 = 3 (one 1st place)
  // m2: 0 + 2 + 1 = 3 (one 1st place)
  // m3: 1 + 0 + 2 = 3 (one 1st place)
  // Scores and 1st-place votes are identical -> alphabetical tie breaker selects m1
  const res = tallyBorda(candidates, votes);
  assert.equal(res.winner, 'm1');
  assert.equal(res.scores[0].score, 3);
  assert.equal(res.scores[1].score, 3);
  assert.equal(res.scores[2].score, 3);
});

test('tallyApproval computes approvals and breaks ties alphabetically', () => {
  const candidates = ['t-dune', 't-oppy', 't-batman'];
  const votes = [
    { voterId: 'u1', approvals: ['t-dune', 't-oppy'] },
    { voterId: 'u2', approvals: ['t-oppy'] },
    { voterId: 'u3', approvals: ['t-batman', 't-oppy'] }
  ];
  // t-oppy: 3
  // t-dune: 1
  // t-batman: 1
  const result = tallyApproval(candidates, votes);
  assert.equal(result.winner, 't-oppy');
  assert.equal(result.scores[0].candidateId, 't-oppy');
  assert.equal(result.scores[0].score, 3);
  // t-batman and t-dune both have 1, t-batman comes before t-dune alphabetically
  assert.equal(result.scores[1].candidateId, 't-batman');
  assert.equal(result.scores[2].candidateId, 't-dune');
});
