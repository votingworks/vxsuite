import { buildMockCard } from '../test/utils';
import { DippedSmartCardAuth } from './dipped_smart_card_auth';

beforeEach(() => {
  jest.useFakeTimers();
});

test('DippedSmartCardAuth returns auth status', async () => {
  const card = buildMockCard();
  const auth = new DippedSmartCardAuth({ card, config: {} });
  expect(await auth.getAuthStatus({ electionHash: undefined })).toEqual({
    status: 'logged_out',
    reason: 'machine_locked',
  });
});
