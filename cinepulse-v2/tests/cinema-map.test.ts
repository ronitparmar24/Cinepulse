import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCinemaGraph } from '../lib/cinemaMap';

test('Cinema Map: builds 2-hop relational graph with root, cast/director, and related titles', async () => {
  const graph = await buildCinemaGraph('dune-part-two');

  assert.equal(graph.rootId, 'dune-part-two');
  assert.ok(graph.nodes.length > 3);
  assert.ok(graph.edges.length > 2);

  // Root node
  const root = graph.nodes.find(n => n.hop === 0);
  assert.ok(root);
  assert.equal(root.id, 'dune-part-two');
  assert.equal(root.type, 'title');

  // Hop 1 nodes (Director, Cast, Genre)
  const hop1 = graph.nodes.filter(n => n.hop === 1);
  assert.ok(hop1.length >= 2);
  const hasPersonOrGenre = hop1.some(n => n.type === 'director' || n.type === 'actor' || n.type === 'genre');
  assert.ok(hasPersonOrGenre);

  // Check edges
  const rootEdges = graph.edges.filter(e => e.source === 'dune-part-two');
  assert.ok(rootEdges.length >= 2);
});
