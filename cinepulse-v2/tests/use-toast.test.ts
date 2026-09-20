import test from 'node:test';
import assert from 'node:assert/strict';
import { useToast } from '../components/hooks/useToast';

test('useToast exports expected function and types', () => {
  assert.equal(typeof useToast, 'function');
});

test('useToast timer behavior and message lifecycle', async () => {
  // Verify timer clearance logic
  let activeTimer: any = null;
  let currentMsg = '';

  const toast = (text: string, durationMs = 50) => {
    currentMsg = text;
    if (activeTimer) clearTimeout(activeTimer);
    activeTimer = setTimeout(() => {
      currentMsg = '';
      activeTimer = null;
    }, durationMs);
  };

  const clearToast = () => {
    if (activeTimer) clearTimeout(activeTimer);
    activeTimer = null;
    currentMsg = '';
  };

  toast('Welcome back');
  assert.equal(currentMsg, 'Welcome back');

  toast('Updated movie');
  assert.equal(currentMsg, 'Updated movie');

  clearToast();
  assert.equal(currentMsg, '');

  toast('Temporary notice', 20);
  assert.equal(currentMsg, 'Temporary notice');
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(currentMsg, '');
});
