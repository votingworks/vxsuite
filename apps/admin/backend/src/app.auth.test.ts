import { DateTime } from 'luxon';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { TEST_JURISDICTION } from '@votingworks/types';

import { buildTestEnvironment, configureMachine } from '../test/app';

beforeEach(() => {
  process.env = { ...process.env, VX_MACHINE_JURISDICTION: TEST_JURISDICTION };
});

const jurisdiction = TEST_JURISDICTION;
const { electionDefinition } = electionFamousNames2021Fixtures;
const { electionData, electionHash } = electionDefinition;

test('getAuthStatus', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);

  // Gets called once during configuration
  expect(auth.getAuthStatus).toHaveBeenCalledTimes(1);

  await apiClient.getAuthStatus();
  expect(auth.getAuthStatus).toHaveBeenCalledTimes(2);
  expect(auth.getAuthStatus).toHaveBeenNthCalledWith(2, {
    electionHash,
    jurisdiction,
  });
});

test('checkPin', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);

  await apiClient.checkPin({ pin: '123456' });
  expect(auth.checkPin).toHaveBeenCalledTimes(1);
  expect(auth.checkPin).toHaveBeenNthCalledWith(
    1,
    { electionHash, jurisdiction },
    { pin: '123456' }
  );
});

test('logOut', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);

  await apiClient.logOut();
  expect(auth.logOut).toHaveBeenCalledTimes(1);
  expect(auth.logOut).toHaveBeenNthCalledWith(1, {
    electionHash,
    jurisdiction,
  });
});

test('updateSessionExpiry', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);

  await apiClient.updateSessionExpiry({
    sessionExpiresAt: DateTime.now().plus({ seconds: 60 }).toJSDate(),
  });
  expect(auth.updateSessionExpiry).toHaveBeenCalledTimes(1);
  expect(auth.updateSessionExpiry).toHaveBeenNthCalledWith(
    1,
    { electionHash, jurisdiction },
    { sessionExpiresAt: expect.any(Date) }
  );
});

test('programCard', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);

  void (await apiClient.programCard({ userRole: 'system_administrator' }));
  expect(auth.programCard).toHaveBeenCalledTimes(1);
  expect(auth.programCard).toHaveBeenNthCalledWith(
    1,
    { electionHash, jurisdiction },
    { userRole: 'system_administrator' }
  );

  void (await apiClient.programCard({ userRole: 'election_manager' }));
  expect(auth.programCard).toHaveBeenCalledTimes(2);
  expect(auth.programCard).toHaveBeenNthCalledWith(
    2,
    { electionHash, jurisdiction },
    { userRole: 'election_manager', electionData }
  );
});

test('unprogramCard', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);

  void (await apiClient.unprogramCard());
  expect(auth.unprogramCard).toHaveBeenCalledTimes(1);
  expect(auth.unprogramCard).toHaveBeenNthCalledWith(1, {
    electionHash,
    jurisdiction,
  });
});

test('getAuthStatus before election definition has been configured', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await apiClient.getAuthStatus();
  expect(auth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(auth.getAuthStatus).toHaveBeenNthCalledWith(1, { jurisdiction });
});

test('checkPin before election definition has been configured', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await apiClient.checkPin({ pin: '123456' });
  expect(auth.checkPin).toHaveBeenCalledTimes(1);
  expect(auth.checkPin).toHaveBeenNthCalledWith(
    1,
    { jurisdiction },
    { pin: '123456' }
  );
});

test('logOut before election definition has been configured', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await apiClient.logOut();
  expect(auth.logOut).toHaveBeenCalledTimes(1);
  expect(auth.logOut).toHaveBeenNthCalledWith(1, { jurisdiction });
});

test('updateSessionExpiry before election definition has been configured', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await apiClient.updateSessionExpiry({
    sessionExpiresAt: DateTime.now().plus({ seconds: 60 }).toJSDate(),
  });
  expect(auth.updateSessionExpiry).toHaveBeenCalledTimes(1);
  expect(auth.updateSessionExpiry).toHaveBeenNthCalledWith(
    1,
    { jurisdiction },
    { sessionExpiresAt: expect.any(Date) }
  );
});
