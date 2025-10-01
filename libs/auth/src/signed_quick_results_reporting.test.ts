import { expect, test, vi } from 'vitest';
import { electionGeneralFixtures } from '@votingworks/fixtures';
import { DEV_MACHINE_ID, Tabulation } from '@votingworks/types';
import { compressAndEncodeTally } from '@votingworks/utils';
import { err, ok } from '@votingworks/basics';

import { getTestFilePath } from '../test/utils';
import { SignedQuickResultsReportingConfig } from './config';
import {
  generateSignedQuickResultsReportingUrl,
  authenticateSignedQuickResultsReportingUrl,
  decodeQuickResultsMessage,
  encodeQuickResultsMessage,
  QR_MESSAGE_FORMAT,
} from './signed_quick_results_reporting';
import { constructPrefixedMessage } from './signatures';

vi.mock(
  '@votingworks/utils',
  async (importActual): Promise<typeof import('@votingworks/utils')> => ({
    ...(await importActual<typeof import('@votingworks/utils')>()),
    compressAndEncodeTally: vi
      .fn<typeof compressAndEncodeTally>()
      .mockReturnValue(''),
  })
);

const vxScanTestConfig: SignedQuickResultsReportingConfig = {
  machinePrivateKey: {
    source: 'file',
    path: getTestFilePath({ fileType: 'vx-scan-private-key.pem' }),
  },
  machineCertPath: getTestFilePath({ fileType: 'vx-scan-cert.pem' }),
};

const electionDefinition = electionGeneralFixtures.readElectionDefinition();
const mockedResults = {} as unknown as Tabulation.ElectionResults;

test.each<{ isLiveMode: boolean }>([
  { isLiveMode: false },
  { isLiveMode: true },
])(
  'Generating signed quick results reporting URL, isLiveMode = $isLiveMode',
  async ({ isLiveMode }) => {
    const signedQuickResultsReportingUrl =
      await generateSignedQuickResultsReportingUrl(
        {
          electionDefinition,
          isLiveMode,
          quickResultsReportingUrl: 'https://example.com',
          results: mockedResults,
          signingMachineId: DEV_MACHINE_ID,
          precinctSelection: { kind: 'AllPrecincts' },
        },
        vxScanTestConfig
      );

    expect(compressAndEncodeTally).toHaveBeenCalledTimes(1);
    expect(signedQuickResultsReportingUrl).toMatch(
      /^https:\/\/example.com\?p=.*&s=[^&]+&c=[^&]+$/
    );
  }
);

test('authenticateSignedQuickResultsReportingUrl - success case with real certificates', async () => {
  // First generate a valid signed URL to get real payload, signature, and certificate
  const signedUrl = await generateSignedQuickResultsReportingUrl(
    {
      electionDefinition,
      isLiveMode: true,
      quickResultsReportingUrl: 'https://example.com',
      results: mockedResults,
      signingMachineId: DEV_MACHINE_ID,
      precinctSelection: { kind: 'AllPrecincts' },
    },
    vxScanTestConfig
  );

  // Extract the payload, signature, and certificate from the URL
  const url = new URL(signedUrl);
  const payload = url.searchParams.get('p') ?? '';
  const signature = url.searchParams.get('s') ?? '';
  const certificate = url.searchParams.get('c') ?? '';

  // Use the VX certificate authority cert that the vx-scan cert was signed by
  const vxCertAuthorityCertPath = getTestFilePath({
    fileType: 'vx-cert-authority-cert.pem',
  });

  const result = await authenticateSignedQuickResultsReportingUrl(
    payload,
    signature,
    certificate,
    vxCertAuthorityCertPath
  );

  expect(result).toEqual(ok());
});

test('authenticateSignedQuickResultsReportingUrl - invalid signature', async () => {
  // First generate a valid signed URL to get real payload and certificate
  const signedUrl = await generateSignedQuickResultsReportingUrl(
    {
      electionDefinition,
      isLiveMode: true,
      quickResultsReportingUrl: 'https://example.com',
      results: mockedResults,
      signingMachineId: DEV_MACHINE_ID,
      precinctSelection: { kind: 'AllPrecincts' },
    },
    vxScanTestConfig
  );

  // Extract the payload and certificate from the URL
  const url = new URL(signedUrl);
  const payload = url.searchParams.get('p') ?? '';
  const certificate = url.searchParams.get('c') ?? '';

  // Use an invalid signature
  const invalidSignature = 'invalidSignature';

  const vxCertAuthorityCertPath = getTestFilePath({
    fileType: 'vx-cert-authority-cert.pem',
  });

  const result = await authenticateSignedQuickResultsReportingUrl(
    payload,
    invalidSignature,
    certificate,
    vxCertAuthorityCertPath
  );

  expect(result).toEqual(err('invalid-signature'));
});

test('authenticateSignedQuickResultsReportingUrl - invalid certificate format', async () => {
  const vxCertAuthorityCertPath = getTestFilePath({
    fileType: 'vx-cert-authority-cert.pem',
  });

  const result = await authenticateSignedQuickResultsReportingUrl(
    'somePayload',
    'someSignature',
    'invalidCertificate',
    vxCertAuthorityCertPath
  );

  expect(result).toEqual(err('invalid-signature'));
});

test('authenticateSignedQuickResultsReportingUrl - tampered payload', async () => {
  // First generate a valid signed URL
  const signedUrl = await generateSignedQuickResultsReportingUrl(
    {
      electionDefinition,
      isLiveMode: true,
      quickResultsReportingUrl: 'https://example.com',
      results: mockedResults,
      signingMachineId: DEV_MACHINE_ID,
      precinctSelection: { kind: 'AllPrecincts' },
    },
    vxScanTestConfig
  );

  // Extract the signature and certificate from the URL
  const url = new URL(signedUrl);
  const signature = url.searchParams.get('s') ?? '';
  const certificate = url.searchParams.get('c') ?? '';

  // Use a tampered payload
  const tamperedPayload = 'qr1:tamperedData';

  const vxCertAuthorityCertPath = getTestFilePath({
    fileType: 'vx-cert-authority-cert.pem',
  });

  const result = await authenticateSignedQuickResultsReportingUrl(
    tamperedPayload,
    signature,
    certificate,
    vxCertAuthorityCertPath
  );

  expect(result).toEqual(err('invalid-signature'));
});

test('decodeQuickResultsMessage throws error when given invalid payload', () => {
  expect(() => {
    decodeQuickResultsMessage('invalidPayload');
  }).toThrow('Invalid prefixed message format');

  expect(() => {
    decodeQuickResultsMessage(
      constructPrefixedMessage('invalidFormat', 'data')
    );
  }).toThrow();

  expect(() => {
    decodeQuickResultsMessage(
      constructPrefixedMessage(QR_MESSAGE_FORMAT, 'data')
    );
  }).toThrow('Invalid message payload format');

  const timeInSeconds = new Date('2024-01-01T00:00:00Z').getTime() / 1000;
  const encodedMessage = encodeQuickResultsMessage({
    ballotHash: 'mockBallotHash',
    signingMachineId: 'machineId',
    isLiveMode: false,
    timestamp: timeInSeconds,
    compressedTally: 'sampleCompressedTally',
    precinctSelection: { kind: 'AllPrecincts' },
  });
  expect(() => {
    decodeQuickResultsMessage(
      constructPrefixedMessage(
        QR_MESSAGE_FORMAT,
        // mimic extra data appended after the valid payload
        `${encodedMessage}\x00extraData`
      )
    );
  }).toThrow('Invalid message payload format');

  expect(() => {
    decodeQuickResultsMessage(
      constructPrefixedMessage(
        QR_MESSAGE_FORMAT,
        // remove the final field
        encodedMessage.replace('\x00sampleCompressedTally', '')
      )
    );
  }).toThrow('Invalid message payload format');
  expect(() => {
    decodeQuickResultsMessage(
      constructPrefixedMessage(
        QR_MESSAGE_FORMAT,
        // make the final field empty
        encodedMessage.replace('sampleCompressedTally', '')
      )
    );
  }).toThrow('Missing required message payload components');
  expect(() => {
    decodeQuickResultsMessage(
      constructPrefixedMessage(
        QR_MESSAGE_FORMAT,
        // make the final field empty
        encodedMessage.replace(timeInSeconds.toString(), 'notATimestamp')
      )
    );
  }).toThrow('Invalid timestamp format');
});

test('encodeQuickResultsMessage and decodeQuickResultsMessage handle proper payloads no precinct id', () => {
  const decoded = decodeQuickResultsMessage(
    constructPrefixedMessage(
      QR_MESSAGE_FORMAT,
      encodeQuickResultsMessage({
        ballotHash: 'mockBallotHash',
        signingMachineId: 'machineId',
        isLiveMode: false,
        timestamp: new Date('2024-01-01T00:00:00Z').getTime() / 1000,
        compressedTally: 'sampleCompressedTally',
        precinctSelection: { kind: 'AllPrecincts' },
      })
    )
  );
  expect(decoded).toMatchInlineSnapshot(`
    {
      "ballotHash": "mockBallotHash",
      "encodedCompressedTally": "sampleCompressedTally",
      "isLive": false,
      "machineId": "machineId",
      "precinctSelection": {
        "kind": "AllPrecincts",
      },
      "signedTimestamp": 2024-01-01T00:00:00.000Z,
    }
  `);
});

test('encodeQuickResultsMessage and decodeQuickResultsMessage handle proper payloads with single precinct selection', () => {
  const decoded = decodeQuickResultsMessage(
    constructPrefixedMessage(
      QR_MESSAGE_FORMAT,
      encodeQuickResultsMessage({
        ballotHash: 'mockBallotHash',
        signingMachineId: 'machineId',
        isLiveMode: false,
        timestamp: new Date('2024-01-01T00:00:00Z').getTime() / 1000,
        compressedTally: 'sampleCompressedTally',
        precinctSelection: {
          kind: 'SinglePrecinct',
          precinctId: 'mockPrecinctId',
        },
      })
    )
  );
  expect(decoded).toMatchInlineSnapshot(`
    {
      "ballotHash": "mockBallotHash",
      "encodedCompressedTally": "sampleCompressedTally",
      "isLive": false,
      "machineId": "machineId",
      "precinctSelection": {
        "kind": "SinglePrecinct",
        "precinctId": "mockPrecinctId",
      },
      "signedTimestamp": 2024-01-01T00:00:00.000Z,
    }
  `);
});
