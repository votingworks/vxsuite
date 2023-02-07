import { MemoryCard as MockMemoryCard } from '@votingworks/utils';

import { InsertedSmartCardAuthWithMemoryCard } from './inserted_smart_card_auth_with_memory_card';

beforeEach(() => {
  jest.useFakeTimers();
});

test('InsertedSmartCardAuthWithMemoryCard returns auth status', () => {
  const card = new MockMemoryCard();
  const auth = new InsertedSmartCardAuthWithMemoryCard({
    card,
    config: { allowedUserRoles: [] },
  });
  expect(auth.getAuthStatus()).toEqual({
    status: 'logged_out',
    reason: 'no_card',
  });
});
