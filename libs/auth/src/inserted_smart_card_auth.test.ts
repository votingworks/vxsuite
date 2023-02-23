import { MemoryCard as MockMemoryCard } from '@votingworks/utils';

import { InsertedSmartCardAuth } from './inserted_smart_card_auth';

beforeEach(() => {
  jest.useFakeTimers();
});

test('InsertedSmartCardAuth returns auth status', async () => {
  const card = new MockMemoryCard();
  const auth = new InsertedSmartCardAuth({
    card,
    config: { allowedUserRoles: [] },
  });
  expect(await auth.getAuthStatus({ electionHash: undefined })).toEqual({
    status: 'logged_out',
    reason: 'no_card',
  });
});
