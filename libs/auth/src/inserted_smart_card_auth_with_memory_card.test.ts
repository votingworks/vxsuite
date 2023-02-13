import { MemoryCard as MockMemoryCard } from '@votingworks/shared';

import { InsertedSmartCardAuthWithMemoryCard } from './inserted_smart_card_auth_with_memory_card';

beforeEach(() => {
  jest.useFakeTimers();
});

test('InsertedSmartCardAuthWithMemoryCard returns auth status', async () => {
  const card = new MockMemoryCard();
  const auth = new InsertedSmartCardAuthWithMemoryCard({
    card,
    config: { allowedUserRoles: [] },
  });
  expect(await auth.getAuthStatus({ electionHash: undefined })).toEqual({
    status: 'logged_out',
    reason: 'no_card',
  });
});
