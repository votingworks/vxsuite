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

const sampleCompressedTally = 'a'.repeat(500);

vi.mock(
  '@votingworks/utils',
  async (importActual): Promise<typeof import('@votingworks/utils')> => ({
    ...(await importActual<typeof import('@votingworks/utils')>()),
    compressAndEncodeTally: vi
      .fn()
      .mockImplementation((args: { numPages?: number }) => {
        const numPages = args?.numPages ?? 1;
        // Split sampleCompressedTally into numPages equal parts
        const partLength = Math.ceil(sampleCompressedTally.length / numPages);
        const parts = [];
        for (let i = 0; i < numPages; i += 1) {
          parts.push(
            sampleCompressedTally.slice(i * partLength, (i + 1) * partLength)
          );
        }
        return parts;
      }),
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
  'Generating signed polls closed quick results reporting URL, isLiveMode = $isLiveMode',
  async ({ isLiveMode }) => {
    const signedQuickResultsReportingUrls =
      await generateSignedQuickResultsReportingUrl(
        {
          electionDefinition,
          isLiveMode,
          quickResultsReportingUrl: 'https://example.com',
          results: mockedResults,
          signingMachineId: DEV_MACHINE_ID,
          precinctSelection: { kind: 'AllPrecincts' },
          pollsState: 'polls_closed_final',
        },
        vxScanTestConfig
      );

    expect(signedQuickResultsReportingUrls).toHaveLength(1);
    const signedQuickResultsReportingUrl =
      signedQuickResultsReportingUrls[0] as string;

    expect(compressAndEncodeTally).toHaveBeenCalledTimes(1);
    expect(signedQuickResultsReportingUrl).not.toContain('polls_open');
    expect(signedQuickResultsReportingUrl).toMatch(
      /^https:\/\/example.com\?p=.*&s=[^&]+&c=[^&]+$/
    );
  }
);

test.each<{ isLiveMode: boolean }>([
  { isLiveMode: false },
  { isLiveMode: true },
])(
  'Generating signed polls closed multi-part quick results reporting URL, isLiveMode = $isLiveMode',
  async ({ isLiveMode }) => {
    const signedQuickResultsReportingUrls =
      await generateSignedQuickResultsReportingUrl(
        {
          electionDefinition,
          isLiveMode,
          quickResultsReportingUrl: 'https://example.com',
          results: mockedResults,
          signingMachineId: DEV_MACHINE_ID,
          precinctSelection: { kind: 'AllPrecincts' },
          pollsState: 'polls_closed_final',
          maxQrCodeLength: 1000, // Force multi-part by setting a small max length
        },
        vxScanTestConfig
      );

    expect(signedQuickResultsReportingUrls).toHaveLength(3);
    const signedQuickResultsReportingUrl1 =
      signedQuickResultsReportingUrls[0] as string;
    const signedQuickResultsReportingUrl2 =
      signedQuickResultsReportingUrls[1] as string;
    const signedQuickResultsReportingUrl3 =
      signedQuickResultsReportingUrls[2] as string;

    expect(compressAndEncodeTally).toHaveBeenCalledTimes(3);
    expect(signedQuickResultsReportingUrl1).not.toContain('polls_open');
    expect(signedQuickResultsReportingUrl2).not.toContain('polls_open');
    expect(signedQuickResultsReportingUrl1).toMatch(
      /^https:\/\/example.com\?p=.*&s=[^&]+&c=[^&]+$/
    );
    expect(signedQuickResultsReportingUrl2).toMatch(
      /^https:\/\/example.com\?p=.*&s=[^&]+&c=[^&]+$/
    );
    expect(signedQuickResultsReportingUrl3).toMatch(
      /^https:\/\/example.com\?p=.*&s=[^&]+&c=[^&]+$/
    );
  }
);

test('If it is impossible to fit the signed quick results reporting URL within the max length even when broken into the maximum number of parts, an error is thrown', async () => {
  await expect(() =>
    generateSignedQuickResultsReportingUrl(
      {
        electionDefinition,
        isLiveMode: true,
        quickResultsReportingUrl: 'https://example.com',
        results: mockedResults,
        signingMachineId: DEV_MACHINE_ID,
        precinctSelection: { kind: 'AllPrecincts' },
        pollsState: 'polls_closed_final',
        maxQrCodeLength: 10, // impossible length
      },
      vxScanTestConfig
    )
  ).rejects.toThrow(
    `Unable to fit signed quick results reporting URL within 10 bytes broken up over 25 parts`
  );
  expect(compressAndEncodeTally).toHaveBeenCalledTimes(25);
}, 20000);

test('generateSignedQuickResultsReportingUrl works for reporting polls open status - live all precincts', async () => {
  const signedQuickResultsReportingUrls =
    await generateSignedQuickResultsReportingUrl(
      {
        electionDefinition,
        isLiveMode: true,
        quickResultsReportingUrl: 'https://example.com',
        results: mockedResults,
        signingMachineId: DEV_MACHINE_ID,
        precinctSelection: { kind: 'AllPrecincts' },
        pollsState: 'polls_open',
      },
      vxScanTestConfig
    );
  expect(signedQuickResultsReportingUrls).toHaveLength(1);
  const signedQuickResultsReportingUrl =
    signedQuickResultsReportingUrls[0] as string;

  // We do not need a compressed tally when reporting polls open status
  expect(compressAndEncodeTally).toHaveBeenCalledTimes(0);
  expect(signedQuickResultsReportingUrl).toMatch(
    /^https:\/\/example.com\?p=.*&s=[^&]+&c=[^&]+$/
  );
  expect(signedQuickResultsReportingUrl).toContain('polls_open');
});

test('generateSignedQuickResultsReportingUrl works for reporting polls open status - test single precincts', async () => {
  const signedQuickResultsReportingUrls =
    await generateSignedQuickResultsReportingUrl(
      {
        electionDefinition,
        isLiveMode: false,
        quickResultsReportingUrl: 'https://example.com',
        results: mockedResults,
        signingMachineId: DEV_MACHINE_ID,
        precinctSelection: {
          kind: 'SinglePrecinct',
          precinctId: 'mockPrecinctId',
        },
        pollsState: 'polls_open',
      },
      vxScanTestConfig
    );

  expect(signedQuickResultsReportingUrls).toHaveLength(1);
  const signedQuickResultsReportingUrl =
    signedQuickResultsReportingUrls[0] as string;
  // We do not need a compressed tally when reporting polls open status
  expect(compressAndEncodeTally).toHaveBeenCalledTimes(0);
  expect(signedQuickResultsReportingUrl).toMatch(
    /^https:\/\/example.com\?p=.*&s=[^&]+&c=[^&]+$/
  );
  expect(signedQuickResultsReportingUrl).toContain('polls_open');
  expect(signedQuickResultsReportingUrl).toContain('mockPrecinctId');
});

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
      pollsState: 'polls_closed_final',
    },
    vxScanTestConfig
  );
  expect(signedUrl).toHaveLength(1);

  // Extract the payload, signature, and certificate from the URL
  const url = new URL(signedUrl[0] as string);
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
      pollsState: 'polls_closed_final',
    },
    vxScanTestConfig
  );
  expect(signedUrl).toHaveLength(1);

  // Extract the payload and certificate from the URL
  const url = new URL(signedUrl[0] as string);
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
      pollsState: 'polls_closed_final',
    },
    vxScanTestConfig
  );
  expect(signedUrl).toHaveLength(1);

  // Extract the signature and certificate from the URL
  const url = new URL(signedUrl[0] as string);
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
    primaryMessage: 'sampleCompressedTally',
    precinctSelection: { kind: 'AllPrecincts' },
    numPages: 88,
    pageIndex: 77,
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
        // remove the final field
        encodedMessage.replace('88', 'nan')
      )
    );
  }).toThrow('Invalid number of pages format');

  expect(() => {
    decodeQuickResultsMessage(
      constructPrefixedMessage(
        QR_MESSAGE_FORMAT,
        // remove the final field
        encodedMessage.replace('77', 'nan')
      )
    );
  }).toThrow('Invalid page index format');

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
        primaryMessage: 'sampleCompressedTally',
        precinctSelection: { kind: 'AllPrecincts' },
        numPages: 1,
        pageIndex: 0,
      })
    )
  );
  expect(decoded).toMatchInlineSnapshot(`
    {
      "ballotHash": "mockBallotHash",
      "encodedCompressedTally": "sampleCompressedTally",
      "isLive": false,
      "machineId": "machineId",
      "numPages": 1,
      "pageIndex": 0,
      "pollsState": "polls_closed_final",
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
        primaryMessage: 'sampleCompressedTally',
        precinctSelection: {
          kind: 'SinglePrecinct',
          precinctId: 'mockPrecinctId',
        },
        numPages: 1,
        pageIndex: 0,
      })
    )
  );
  expect(decoded).toMatchInlineSnapshot(`
    {
      "ballotHash": "mockBallotHash",
      "encodedCompressedTally": "sampleCompressedTally",
      "isLive": false,
      "machineId": "machineId",
      "numPages": 1,
      "pageIndex": 0,
      "pollsState": "polls_closed_final",
      "precinctSelection": {
        "kind": "SinglePrecinct",
        "precinctId": "mockPrecinctId",
      },
      "signedTimestamp": 2024-01-01T00:00:00.000Z,
    }
  `);
});

test('encodeQuickResultsMessage and decodeQuickResultsMessage handle reporting polls open status', () => {
  const encoded = encodeQuickResultsMessage({
    ballotHash: 'mockBallotHash',
    signingMachineId: 'machineId',
    isLiveMode: false,
    timestamp: new Date('2024-01-01T00:00:00Z').getTime() / 1000,
    primaryMessage: 'polls_open',
    precinctSelection: {
      kind: 'SinglePrecinct',
      precinctId: 'mockPrecinctId',
    },
    numPages: 1,
    pageIndex: 0,
  });

  expect(encoded).toContain('polls_open');
  const decoded = decodeQuickResultsMessage(
    constructPrefixedMessage(QR_MESSAGE_FORMAT, encoded)
  );
  expect(decoded).toMatchInlineSnapshot(`
    {
      "ballotHash": "mockBallotHash",
      "encodedCompressedTally": "",
      "isLive": false,
      "machineId": "machineId",
      "numPages": 1,
      "pageIndex": 0,
      "pollsState": "polls_open",
      "precinctSelection": {
        "kind": "SinglePrecinct",
        "precinctId": "mockPrecinctId",
      },
      "signedTimestamp": 2024-01-01T00:00:00.000Z,
    }
  `);
});
