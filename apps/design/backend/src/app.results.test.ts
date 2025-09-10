import { afterAll, beforeEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { getFeatureFlagMock } from '@votingworks/utils';
import { err, ok, Result } from '@votingworks/basics';
import { testSetupHelpers } from '../test/helpers';

const mockFeatureFlagger = getFeatureFlagMock();

const { setupApp, cleanup } = testSetupHelpers();

afterAll(cleanup);

// Mock the authentication function so we can control its behavior in tests
let mockAuthReturnValue: Result<void, 'invalid-signature'> = ok();
vi.mock('@votingworks/auth', async (importActual) => ({
  ...(await importActual()),
  authenticateSignedQuickResultsReportingUrl: vi
    .fn()
    .mockImplementation(() => mockAuthReturnValue),
}));

beforeEach(() => {
  mockAuthReturnValue = ok();
  mockFeatureFlagger.resetFeatureFlags();
});

test('processQRCodeReport handles invalid payloads as expected', async () => {
  const { unauthenticatedApiClient } = await setupApp([]);
  // You can call processQrCodeReport without authentication

  const invalidPayloads = [
    'bad-payload', // No separator
    '0//qr1//message', // Bad version
    '1//bad-header//message', // Bad header
    '1//qr1//', // No message
    '1//qr1//ballotHash.machineId.0.badtimestamp.', // Bad timestamp
    '1//qr1//ballotHash.machineId.0.1757449351.notb64data', // Bad data
  ];
  for (const payload of invalidPayloads) {
    const result = await unauthenticatedApiClient.processQrCodeReport({
      payload,
      signature: 'test-signature',
      certificate: 'test-certificate',
    });
    expect(result.err()).toEqual('invalid-payload');
  }
});

test('processQRCodeReport returns "invalid-signature" when authenticating the signature and certificate fails', async () => {
  const { unauthenticatedApiClient } = await setupApp([]);
  // You can call processQrCodeReport without authentication
  const mockCompressedTally = [
    [0, 4, 5, 6, 1],
    [1, 1, 3, 5],
    [0, 0, 0, 0],
  ];
  const b64EncodedTally = Buffer.from(
    JSON.stringify(mockCompressedTally)
  ).toString('base64');
  mockAuthReturnValue = err('invalid-signature');

  const result = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr1//ballotHash.DEV-1.0.1757449351.${b64EncodedTally}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(result.err()).toEqual('invalid-signature');
});

test('processQRCodeReport handles valid payloads as expected', async () => {
  const { unauthenticatedApiClient } = await setupApp([]);
  // You can call processQrCodeReport without authentication
  const mockCompressedTally = [
    [0, 4, 5, 6, 1],
    [1, 1, 3, 5],
    [0, 0, 0, 0],
  ];
  const b64EncodedTally = Buffer.from(
    JSON.stringify(mockCompressedTally)
  ).toString('base64');
  const result = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr1//ballotHash.DEV-1.0.1757449351.${b64EncodedTally}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(result.ok()).toEqual({
    ballotHash: 'ballotHash',
    machineId: 'DEV-1',
    isLive: false,
    signedTimestamp: new Date(1757449351 * 1000),
    tally: mockCompressedTally,
  });
});
