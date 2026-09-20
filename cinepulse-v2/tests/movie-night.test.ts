import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMovieNightSession,
  getMovieNightSession,
  joinMovieNightSession,
  submitMovieNightVote,
  finalizeMovieNightSession
} from '../lib/movieNight';

test('Movie Night Session: creates, joins, votes with Borda, and determines winner', async () => {
  const host = { id: 'user_host', name: 'Alice Host' };
  const session = await createMovieNightSession(host, {
    title: 'Weekend Sci-Fi Night',
    method: 'borda',
    maxRuntime: 180
  });

  assert.ok(session.id.startsWith('mn_'));
  assert.equal(session.sessionCode.length, 6);
  assert.equal(session.title, 'Weekend Sci-Fi Night');
  assert.equal(session.status, 'voting');
  assert.ok(session.candidates.length >= 2);

  // Retrieve session by code
  const fetched = getMovieNightSession(session.sessionCode);
  assert.ok(fetched);
  assert.equal(fetched.id, session.id);

  // Guest joins
  const { session: afterJoin, participantId } = joinMovieNightSession(session.sessionCode, 'Bob Guest');
  assert.equal(afterJoin.participants.length, 2);
  assert.ok(participantId);

  // Host votes
  const candIds = session.candidates.map(c => c.id);
  const hostParticipantId = session.participants[0].id;
  submitMovieNightVote(session.sessionCode, hostParticipantId, {
    ranking: [candIds[0], candIds[1]]
  });

  // Guest votes
  const updated = submitMovieNightVote(session.sessionCode, participantId, {
    ranking: [candIds[0], candIds[1]]
  });

  assert.equal(updated.votes.length, 2);
  assert.ok(updated.tally);
  assert.equal(updated.tally.winner, candIds[0]);

  // Finalize
  const finalized = finalizeMovieNightSession(session.sessionCode);
  assert.equal(finalized.status, 'completed');
  assert.equal(finalized.winnerTitle?.id, candIds[0]);
});

test('Movie Night Session: handles approval voting mode correctly', async () => {
  const host = { id: 'host_appr', name: 'Carol' };
  const session = await createMovieNightSession(host, {
    title: 'Comedy Marathon',
    method: 'approval'
  });

  const candIds = session.candidates.map(c => c.id);
  const hostParticipantId = session.participants[0].id;

  submitMovieNightVote(session.sessionCode, hostParticipantId, {
    approvals: [candIds[1]]
  });

  const afterVote = getMovieNightSession(session.sessionCode);
  assert.ok(afterVote?.tally);
  assert.equal(afterVote.tally.method, 'approval');
  assert.equal(afterVote.tally.winner, candIds[1]);
});
