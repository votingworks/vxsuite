import { DateTime } from 'luxon';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { TEST_JURISDICTION } from '@votingworks/types';

import { configureApp, createApp } from '../test/app_helpers';

const jurisdiction = TEST_JURISDICTION;
const { electionDefinition } = electionFamousNames2021Fixtures;
const { electionHash } = electionDefinition;

test('getAuthStatus', async () => {
  const { apiClient, mockAuth, mockUsb } = createApp();
  await configureApp(apiClient, mockAuth, mockUsb);

  // Gets called once during configuration
  expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(1);

  await apiClient.getAuthStatus();
  expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(2);
  expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(2, {
    electionHash,
    jurisdiction,
  });
});

test('checkPin', async () => {
  const { apiClient, mockAuth, mockUsb } = createApp();
  await configureApp(apiClient, mockAuth, mockUsb);

  await apiClient.checkPin({ pin: '123456' });
  expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
  expect(mockAuth.checkPin).toHaveBeenNthCalledWith(
    1,
    { electionHash, jurisdiction },
    { pin: '123456' }
  );
});

test('logOut', async () => {
  const { apiClient, mockAuth, mockUsb } = createApp();
  await configureApp(apiClient, mockAuth, mockUsb);

  await apiClient.logOut();
  expect(mockAuth.logOut).toHaveBeenCalledTimes(1);
  expect(mockAuth.logOut).toHaveBeenNthCalledWith(1, {
    electionHash,
    jurisdiction,
  });
});

test('updateSessionExpiry', async () => {
  const { apiClient, mockAuth, mockUsb } = createApp();
  await configureApp(apiClient, mockAuth, mockUsb);

  await apiClient.updateSessionExpiry({
    sessionExpiresAt: DateTime.now().plus({ seconds: 60 }).toJSDate(),
  });
  expect(mockAuth.updateSessionExpiry).toHaveBeenCalledTimes(1);
  expect(mockAuth.updateSessionExpiry).toHaveBeenNthCalledWith(
    1,
    { electionHash, jurisdiction },
    { sessionExpiresAt: expect.any(Date) }
  );
});

test('startCardlessVoterSession', async () => {
  const { apiClient, mockAuth, mockUsb } = createApp();
  await configureApp(apiClient, mockAuth, mockUsb);

  await apiClient.startCardlessVoterSession({
    ballotStyleId: 'b1',
    precinctId: 'p1',
  });
  expect(mockAuth.startCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.startCardlessVoterSession).toHaveBeenNthCalledWith(
    1,
    { electionHash, jurisdiction },
    { ballotStyleId: 'b1', precinctId: 'p1' }
  );
});

test('endCardlessVoterSession', async () => {
  const { apiClient, mockAuth, mockUsb } = createApp();
  await configureApp(apiClient, mockAuth, mockUsb);

  await apiClient.endCardlessVoterSession();
  expect(mockAuth.endCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.endCardlessVoterSession).toHaveBeenNthCalledWith(1, {
    electionHash,
    jurisdiction,
  });
});

test('getAuthStatus before election definition has been configured', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.getAuthStatus();
  expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(1, {});
});

test('checkPin before election definition has been configured', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.checkPin({ pin: '123456' });
  expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
  expect(mockAuth.checkPin).toHaveBeenNthCalledWith(1, {}, { pin: '123456' });
});

test('logOut before election definition has been configured', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.logOut();
  expect(mockAuth.logOut).toHaveBeenCalledTimes(1);
  expect(mockAuth.logOut).toHaveBeenNthCalledWith(1, {});
});

test('updateSessionExpiry before election definition has been configured', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.updateSessionExpiry({
    sessionExpiresAt: DateTime.now().plus({ seconds: 60 }).toJSDate(),
  });
  expect(mockAuth.updateSessionExpiry).toHaveBeenCalledTimes(1);
  expect(mockAuth.updateSessionExpiry).toHaveBeenNthCalledWith(
    1,
    {},
    { sessionExpiresAt: expect.any(Date) }
  );
});

test('startCardlessVoterSession before election definition has been configured', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.startCardlessVoterSession({
    ballotStyleId: 'b1',
    precinctId: 'p1',
  });
  expect(mockAuth.startCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.startCardlessVoterSession).toHaveBeenNthCalledWith(
    1,
    {},
    { ballotStyleId: 'b1', precinctId: 'p1' }
  );
});

test('endCardlessVoterSession before election definition has been configured', async () => {
  const { apiClient, mockAuth } = createApp();

  await apiClient.endCardlessVoterSession();
  expect(mockAuth.endCardlessVoterSession).toHaveBeenCalledTimes(1);
  expect(mockAuth.endCardlessVoterSession).toHaveBeenNthCalledWith(1, {});
});
