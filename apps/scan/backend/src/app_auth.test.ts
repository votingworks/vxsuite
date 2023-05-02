import { DateTime } from 'luxon';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { DEFAULT_SYSTEM_SETTINGS, TEST_JURISDICTION } from '@votingworks/types';

import { withApp } from '../test/helpers/custom_helpers';
import { configureApp } from '../test/helpers/shared_helpers';

const jurisdiction = TEST_JURISDICTION;
const { electionHash } = electionFamousNames2021Fixtures.electionDefinition;

test('getAuthStatus', async () => {
  await withApp({}, async ({ apiClient, mockAuth, mockUsb }) => {
    await configureApp(apiClient, mockUsb, { mockAuth });

    // Gets called once during configuration
    expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(1);

    await apiClient.getAuthStatus();
    expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(2);
    expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(2, {
      ...DEFAULT_SYSTEM_SETTINGS,
      electionHash,
      jurisdiction,
    });
  });
});

test('checkPin', async () => {
  await withApp({}, async ({ apiClient, mockAuth, mockUsb }) => {
    await configureApp(apiClient, mockUsb, { mockAuth });

    await apiClient.checkPin({ pin: '123456' });
    expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
    expect(mockAuth.checkPin).toHaveBeenNthCalledWith(
      1,
      { ...DEFAULT_SYSTEM_SETTINGS, electionHash, jurisdiction },
      { pin: '123456' }
    );
  });
});

test('logOut', async () => {
  await withApp({}, async ({ apiClient, mockAuth, mockUsb }) => {
    await configureApp(apiClient, mockUsb, { mockAuth });

    await apiClient.logOut();
    expect(mockAuth.logOut).toHaveBeenCalledTimes(1);
    expect(mockAuth.logOut).toHaveBeenNthCalledWith(1, {
      ...DEFAULT_SYSTEM_SETTINGS,
      electionHash,
      jurisdiction,
    });
  });
});

test('updateSessionExpiry', async () => {
  await withApp({}, async ({ apiClient, mockAuth, mockUsb }) => {
    await configureApp(apiClient, mockUsb, { mockAuth });

    await apiClient.updateSessionExpiry({
      sessionExpiresAt: DateTime.now().plus({ seconds: 60 }).toJSDate(),
    });
    expect(mockAuth.updateSessionExpiry).toHaveBeenCalledTimes(1);
    expect(mockAuth.updateSessionExpiry).toHaveBeenNthCalledWith(
      1,
      { ...DEFAULT_SYSTEM_SETTINGS, electionHash, jurisdiction },
      { sessionExpiresAt: expect.any(Date) }
    );
  });
});

test('getAuthStatus before election definition has been configured', async () => {
  await withApp({}, async ({ apiClient, mockAuth }) => {
    await apiClient.getAuthStatus();
    expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(1);
    expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(1, {});
  });
});

test('checkPin before election definition has been configured', async () => {
  await withApp({}, async ({ apiClient, mockAuth }) => {
    await apiClient.checkPin({ pin: '123456' });
    expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
    expect(mockAuth.checkPin).toHaveBeenNthCalledWith(1, {}, { pin: '123456' });
  });
});

test('logOut before election definition has been configured', async () => {
  await withApp({}, async ({ apiClient, mockAuth }) => {
    await apiClient.logOut();
    expect(mockAuth.logOut).toHaveBeenCalledTimes(1);
    expect(mockAuth.logOut).toHaveBeenNthCalledWith(1, {});
  });
});

test('updateSessionExpiry before election definition has been configured', async () => {
  await withApp({}, async ({ apiClient, mockAuth }) => {
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
});
