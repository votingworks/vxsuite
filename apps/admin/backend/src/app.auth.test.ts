import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';

import { buildTestEnvironment, configureMachine } from '../test/app';

const { electionDefinition } = electionFamousNames2021Fixtures;
const { electionData, electionHash } = electionDefinition;

test('getAuthStatus', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);

  // Gets called once during configuration
  expect(auth.getAuthStatus).toHaveBeenCalledTimes(1);

  await apiClient.getAuthStatus();
  expect(auth.getAuthStatus).toHaveBeenCalledTimes(2);
  expect(auth.getAuthStatus).toHaveBeenNthCalledWith(2, { electionHash });
});

test('checkPin', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);

  await apiClient.checkPin({ pin: '123456' });
  expect(auth.checkPin).toHaveBeenCalledTimes(1);
  expect(auth.checkPin).toHaveBeenNthCalledWith(
    1,
    { electionHash },
    { pin: '123456' }
  );
});

test('logOut', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);

  await apiClient.logOut();
  expect(auth.logOut).toHaveBeenCalledTimes(1);
  expect(auth.logOut).toHaveBeenNthCalledWith(1, { electionHash });
});

test('updateSessionExpiry', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);

  await apiClient.updateSessionExpiry({
    sessionExpiresAt: new Date().getTime() + 60 * 1000,
  });
  expect(auth.updateSessionExpiry).toHaveBeenCalledTimes(1);
  expect(auth.updateSessionExpiry).toHaveBeenNthCalledWith(
    1,
    { electionHash },
    { sessionExpiresAt: expect.any(Number) }
  );
});

test('programCard', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);

  void (await apiClient.programCard({ userRole: 'system_administrator' }));
  expect(auth.programCard).toHaveBeenCalledTimes(1);
  expect(auth.programCard).toHaveBeenNthCalledWith(
    1,
    { electionHash },
    { userRole: 'system_administrator' }
  );

  void (await apiClient.programCard({ userRole: 'election_manager' }));
  expect(auth.programCard).toHaveBeenCalledTimes(2);
  expect(auth.programCard).toHaveBeenNthCalledWith(
    2,
    { electionHash },
    { userRole: 'election_manager', electionData }
  );
});

test('unprogramCard', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);

  void (await apiClient.unprogramCard());
  expect(auth.unprogramCard).toHaveBeenCalledTimes(1);
  expect(auth.unprogramCard).toHaveBeenNthCalledWith(1, { electionHash });
});

test('getAuthStatus before election definition has been configured', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await apiClient.getAuthStatus();
  expect(auth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(auth.getAuthStatus).toHaveBeenNthCalledWith(1, {});
});

test('checkPin before election definition has been configured', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await apiClient.checkPin({ pin: '123456' });
  expect(auth.checkPin).toHaveBeenCalledTimes(1);
  expect(auth.checkPin).toHaveBeenNthCalledWith(1, {}, { pin: '123456' });
});

test('logOut before election definition has been configured', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await apiClient.logOut();
  expect(auth.logOut).toHaveBeenCalledTimes(1);
  expect(auth.logOut).toHaveBeenNthCalledWith(1, {});
});

test('updateSessionExpiry before election definition has been configured', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await apiClient.updateSessionExpiry({
    sessionExpiresAt: new Date().getTime() + 60 * 1000,
  });
  expect(auth.updateSessionExpiry).toHaveBeenCalledTimes(1);
  expect(auth.updateSessionExpiry).toHaveBeenNthCalledWith(
    1,
    {},
    { sessionExpiresAt: expect.any(Number) }
  );
});
