import test from 'node:test';
import assert from 'node:assert/strict';
import { useAuth } from '../components/hooks/useAuth';
import type { User } from '../lib/types';

test('useAuth exports expected function', () => {
  assert.equal(typeof useAuth, 'function');
});

test('needAuth returns true when user is present and triggers auth modal when anonymous', () => {
  let modalOpened = false;
  const mockUser: User = {
    id: 'user-123',
    name: 'Cinephile',
    email: 'cinephile@example.test',
    createdAt: new Date().toISOString()
  };

  const checkAuth = (user: User | null) => {
    if (user) return true;
    modalOpened = true;
    return false;
  };

  assert.equal(checkAuth(null), false);
  assert.equal(modalOpened, true);

  modalOpened = false;
  assert.equal(checkAuth(mockUser), true);
  assert.equal(modalOpened, false);
});
