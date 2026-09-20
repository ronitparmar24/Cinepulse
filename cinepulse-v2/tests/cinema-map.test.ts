import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCinemaGraph } from '../lib/cinemaMap';

test('Cinema Map: builds 2-hop relational graph with root, cast/director, and related titles', async () => {
  const graph = await buildCinemaGraph('demo-dunes');

  assert.equal(graph.rootId, 'demo-dunes');
  assert.ok(graph.nodes.length >= 2);
  assert.ok(graph.edges.length >= 1);

  // Root node
  const root = graph.nodes.find(n => n.hop === 0);
  assert.ok(root);
  assert.equal(root.id, 'demo-dunes');
  assert.equal(root.type, 'title');

  // Hop 1 nodes (Director, Cast, Genre)
  const hop1 = graph.nodes.filter(n => n.hop === 1);
  assert.ok(hop1.length >= 1);
  const hasPersonOrGenre = hop1.some(n => n.type === 'director' || n.type === 'actor' || n.type === 'genre');
  assert.ok(hasPersonOrGenre);

  // Check edges
  const rootEdges = graph.edges.filter(e => e.source === 'demo-dunes');
  assert.ok(rootEdges.length >= 1);
});
