import { MemoryCard as MockMemoryCard } from '@votingworks/utils';

import { DippedSmartCardAuthWithMemoryCard } from './dipped_smart_card_auth_with_memory_card';

beforeEach(() => {
  jest.useFakeTimers();
});

test('DippedSmartCardAuthWithMemoryCard returns auth status', async () => {
  const card = new MockMemoryCard();
  const auth = new DippedSmartCardAuthWithMemoryCard({ card, config: {} });
  expect(await auth.getAuthStatus({ electionDefinition: undefined })).toEqual({
    status: 'logged_out',
    reason: 'machine_locked',
  });
});
