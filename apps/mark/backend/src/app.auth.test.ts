import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';

import { createApp } from '../test/app_helpers';

const { electionDefinition } = electionFamousNames2021Fixtures;
const { electionHash } = electionDefinition;

test('getAuthStatus', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.getAuthStatus({ electionHash });
  expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(1, {
    electionHash,
  });
});

test('checkPin', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.checkPin({ electionHash, pin: '123456' });
  expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
  expect(mockAuth.checkPin).toHaveBeenNthCalledWith(
    1,
    { electionHash },
    { pin: '123456' }
  );
});

test('logOut', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.logOut({ electionHash });
  expect(mockAuth.logOut).toHaveBeenCalledTimes(1);
  expect(mockAuth.logOut).toHaveBeenNthCalledWith(1, { electionHash });
});

test('updateSessionExpiry', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.updateSessionExpiry({
    electionHash,
    sessionExpiresAt: new Date().getTime() + 60 * 1000,
  });
  expect(mockAuth.updateSessionExpiry).toHaveBeenCalledTimes(1);
  expect(mockAuth.updateSessionExpiry).toHaveBeenNthCalledWith(
    1,
    { electionHash },
    { sessionExpiresAt: expect.any(Number) }
  );
});

test('startCardlessVoterSession', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.startCardlessVoterSession({
    electionHash,
    ballotStyleId: 'b1',
    precinctId: 'p1',
  });
  expect(mockAuth.startCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.startCardlessVoterSession).toHaveBeenNthCalledWith(
    1,
    { electionHash },
    { ballotStyleId: 'b1', precinctId: 'p1' }
  );
});

test('endCardlessVoterSession', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.endCardlessVoterSession({ electionHash });
  expect(mockAuth.endCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.endCardlessVoterSession).toHaveBeenNthCalledWith(1, {
    electionHash,
  });
});
