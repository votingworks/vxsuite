import { fakeLogger } from '@votingworks/logging';

import { buildMockCard } from '../test/utils';
import { InsertedSmartCardAuth } from './inserted_smart_card_auth';

beforeEach(() => {
  jest.useFakeTimers();
});

test('InsertedSmartCardAuth returns auth status', async () => {
  const auth = new InsertedSmartCardAuth({
    card: buildMockCard(),
    config: { allowedUserRoles: [] },
    logger: fakeLogger(),
  });
  expect(await auth.getAuthStatus({ electionHash: undefined })).toEqual({
    status: 'logged_out',
    reason: 'no_card',
  });
});
