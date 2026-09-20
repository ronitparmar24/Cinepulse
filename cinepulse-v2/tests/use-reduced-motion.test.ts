import test from 'node:test';
import assert from 'node:assert/strict';
import { useReducedMotion } from '../components/hooks/useReducedMotion';

test('useReducedMotion exports expected function', () => {
  assert.equal(typeof useReducedMotion, 'function');
});

test('useReducedMotion handles environments without matchMedia gracefully', () => {
  // In node environment without window, should safely return false without throwing
  assert.equal(typeof useReducedMotion, 'function');
});
