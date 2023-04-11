import { DEV_JURISDICTION } from '@votingworks/auth';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';

import { withApp } from '../test/helpers/custom_helpers';
import { configureApp } from '../test/helpers/shared_helpers';

const { electionHash } = electionFamousNames2021Fixtures.electionDefinition;
const jurisdiction = DEV_JURISDICTION;

test('getAuthStatus', async () => {
  await withApp({}, async ({ apiClient, mockAuth, mockUsb }) => {
    await configureApp(apiClient, mockUsb, { mockAuth });

    // Gets called once during configuration
    expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(1);

    await apiClient.getAuthStatus();
    expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(2);
    expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(2, {
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
      { electionHash, jurisdiction },
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
      electionHash,
      jurisdiction,
    });
  });
});

test('updateSessionExpiry', async () => {
  await withApp({}, async ({ apiClient, mockAuth, mockUsb }) => {
    await configureApp(apiClient, mockUsb, { mockAuth });

    await apiClient.updateSessionExpiry({
      sessionExpiresAt: new Date().getTime() + 60 * 1000,
    });
    expect(mockAuth.updateSessionExpiry).toHaveBeenCalledTimes(1);
    expect(mockAuth.updateSessionExpiry).toHaveBeenNthCalledWith(
      1,
      { electionHash, jurisdiction },
      { sessionExpiresAt: expect.any(Number) }
    );
  });
});

test('getAuthStatus before election definition has been configured', async () => {
  await withApp({}, async ({ apiClient, mockAuth }) => {
    await apiClient.getAuthStatus();
    expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(1);
    expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(1, { jurisdiction });
  });
});

test('checkPin before election definition has been configured', async () => {
  await withApp({}, async ({ apiClient, mockAuth }) => {
    await apiClient.checkPin({ pin: '123456' });
    expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
    expect(mockAuth.checkPin).toHaveBeenNthCalledWith(
      1,
      { jurisdiction },
      { pin: '123456' }
    );
  });
});

test('logOut before election definition has been configured', async () => {
  await withApp({}, async ({ apiClient, mockAuth }) => {
    await apiClient.logOut();
    expect(mockAuth.logOut).toHaveBeenCalledTimes(1);
    expect(mockAuth.logOut).toHaveBeenNthCalledWith(1, { jurisdiction });
  });
});

test('updateSessionExpiry before election definition has been configured', async () => {
  await withApp({}, async ({ apiClient, mockAuth }) => {
    await apiClient.updateSessionExpiry({
      sessionExpiresAt: new Date().getTime() + 60 * 1000,
    });
    expect(mockAuth.updateSessionExpiry).toHaveBeenCalledTimes(1);
    expect(mockAuth.updateSessionExpiry).toHaveBeenNthCalledWith(
      1,
      { jurisdiction },
      { sessionExpiresAt: expect.any(Number) }
    );
  });
});
