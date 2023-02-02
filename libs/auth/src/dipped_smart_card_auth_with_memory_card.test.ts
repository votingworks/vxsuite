import { MemoryCard as MockMemoryCard } from '@votingworks/utils';

import { DippedSmartCardAuthWithMemoryCard } from './dipped_smart_card_auth_with_memory_card';

beforeEach(() => {
  jest.useFakeTimers();
});

test('DippedSmartCardAuthWithMemoryCard returns auth status', () => {
  const card = new MockMemoryCard();
  const auth = new DippedSmartCardAuthWithMemoryCard({ card, config: {} });
  expect(auth.getAuthStatus()).toEqual({
    status: 'logged_out',
    reason: 'machine_locked',
  });
});
