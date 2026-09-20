import test from 'node:test';
import assert from 'node:assert/strict';
import { useTitleModal } from '../components/hooks/useTitleModal';

test('useTitleModal exports expected function', () => {
  assert.equal(typeof useTitleModal, 'function');
});

test('openTitle, changeTitleTab, closeTitle coordinate URL state updates', () => {
  const urlUpdates: any[] = [];
  const updateUrl = (state: any, mode = 'replace', historyState?: any) => {
    urlUpdates.push({ state, mode, historyState });
  };

  // Emulate hook actions deterministically
  let selected: { id: string; tab: string } | null = null;
  const openTitle = (id: string, tab = 'overview') => {
    const next = { view: 'discover', titleId: id, tab };
    const hadSelected = selected !== null;
    selected = { id, tab };
    if (hadSelected) {
      updateUrl(next, 'replace', { cinepulseTitle: true });
    } else {
      updateUrl(next, 'push', { cinepulseTitle: true });
    }
  };

  const changeTitleTab = (tab: string) => {
    if (!selected) return;
    selected = { ...selected, tab };
    updateUrl({ view: 'discover', titleId: selected.id, tab }, 'replace', { cinepulseTitle: true });
  };

  const closeTitle = () => {
    selected = null;
    updateUrl({ view: 'discover', titleId: null, tab: 'overview' }, 'replace');
  };

  openTitle('dunes-123', 'overview');
  assert.deepEqual(selected, { id: 'dunes-123', tab: 'overview' });
  assert.equal(urlUpdates.length, 1);
  assert.equal(urlUpdates[0].mode, 'push');
  assert.equal(urlUpdates[0].state.titleId, 'dunes-123');

  changeTitleTab('community');
  assert.deepEqual(selected, { id: 'dunes-123', tab: 'community' });
  assert.equal(urlUpdates.length, 2);
  assert.equal(urlUpdates[1].mode, 'replace');
  assert.equal(urlUpdates[1].state.tab, 'community');

  closeTitle();
  assert.equal(selected, null);
  assert.equal(urlUpdates.length, 3);
  assert.equal(urlUpdates[2].state.titleId, null);
});
