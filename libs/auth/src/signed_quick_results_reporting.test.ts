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
  QR_MESSAGE_FORMAT_V1,
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
const mockedResults = {
  cardCounts: { bmd: [42], hmpb: [] },
  contestResults: {},
} as unknown as Tabulation.ElectionResults;

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
          pollsTransitionType: 'close_polls',
          votingType: 'election_day',
          pollsTransitionTimestamp: new Date('2024-11-05T20:00:00Z').getTime(),
        },
        vxScanTestConfig
      );

    expect(signedQuickResultsReportingUrls).toHaveLength(1);
    const signedQuickResultsReportingUrl =
      signedQuickResultsReportingUrls[0] as string;

    expect(compressAndEncodeTally).toHaveBeenCalledTimes(1);
    expect(signedQuickResultsReportingUrl).not.toContain('open_polls');
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
          pollsTransitionType: 'close_polls',
          votingType: 'election_day',
          pollsTransitionTimestamp: new Date('2024-11-05T20:00:00Z').getTime(),
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
        pollsTransitionType: 'close_polls',
        votingType: 'election_day',
        pollsTransitionTimestamp: new Date('2024-11-05T20:00:00Z').getTime(),
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
        pollsTransitionType: 'open_polls',
        votingType: 'election_day',
        pollsTransitionTimestamp: new Date('2024-11-05T08:00:00Z').getTime(),
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
  expect(signedQuickResultsReportingUrl).toContain('open_polls');
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
        pollsTransitionType: 'open_polls',
        votingType: 'early_voting',
        pollsTransitionTimestamp: new Date('2024-11-05T08:00:00Z').getTime(),
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
  expect(signedQuickResultsReportingUrl).toContain('open_polls');
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
      pollsTransitionType: 'close_polls',
      votingType: 'election_day',
      pollsTransitionTimestamp: new Date('2024-11-05T20:00:00Z').getTime(),
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
      pollsTransitionType: 'close_polls',
      votingType: 'election_day',
      pollsTransitionTimestamp: new Date('2024-11-05T20:00:00Z').getTime(),
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
      pollsTransitionType: 'close_polls',
      votingType: 'election_day',
      pollsTransitionTimestamp: new Date('2024-11-05T20:00:00Z').getTime(),
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
      constructPrefixedMessage(QR_MESSAGE_FORMAT_V1, 'data')
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
    ballotCount: 0,
    votingType: 'election_day',
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
        // remove fields to get wrong count
        encodedMessage.replace('\x00sampleCompressedTally', '')
      )
    );
  }).toThrow('Invalid message payload format');

  expect(() => {
    decodeQuickResultsMessage(
      constructPrefixedMessage(
        QR_MESSAGE_FORMAT,
        encodedMessage.replace('88', 'nan')
      )
    );
  }).toThrow('Invalid number of pages format');

  expect(() => {
    decodeQuickResultsMessage(
      constructPrefixedMessage(
        QR_MESSAGE_FORMAT,
        encodedMessage.replace('77', 'nan')
      )
    );
  }).toThrow('Invalid page index format');

  expect(() => {
    decodeQuickResultsMessage(
      constructPrefixedMessage(
        QR_MESSAGE_FORMAT,
        // make the primary message field empty
        encodedMessage.replace('sampleCompressedTally', '')
      )
    );
  }).toThrow('Missing required message payload components');
  expect(() => {
    decodeQuickResultsMessage(
      constructPrefixedMessage(
        QR_MESSAGE_FORMAT,
        encodedMessage.replace(timeInSeconds.toString(), 'notATimestamp')
      )
    );
  }).toThrow('Invalid timestamp format');
});

test('decodeQuickResultsMessage rejects invalid numPages, pageIndex, ballotCount, and votingType values', () => {
  const SEP = '\x00'; // Null byte separator used in the QR message format
  const timestamp = (
    new Date('2024-01-01T00:00:00Z').getTime() / 1000
  ).toString();

  function buildPayload(overrides: {
    numPages?: string;
    pageIndex?: string;
    ballotCount?: string;
    votingType?: string;
  }): string {
    const parts = [
      'ballotHash',
      'machineId',
      '1',
      timestamp,
      'sampleTally',
      '',
      overrides.numPages ?? '1',
      overrides.pageIndex ?? '0',
      overrides.ballotCount ?? '0',
      overrides.votingType ?? '0',
    ];
    return constructPrefixedMessage(QR_MESSAGE_FORMAT, parts.join(SEP));
  }

  // numPages must be >= 1
  expect(() =>
    decodeQuickResultsMessage(buildPayload({ numPages: '0' }))
  ).toThrow('Invalid number of pages format');
  expect(() =>
    decodeQuickResultsMessage(buildPayload({ numPages: '-1' }))
  ).toThrow('Invalid number of pages format');

  // pageIndex must be >= 0
  expect(() =>
    decodeQuickResultsMessage(buildPayload({ pageIndex: '-1' }))
  ).toThrow('Invalid page index format');

  // ballotCount must be a valid non-negative integer
  expect(() =>
    decodeQuickResultsMessage(buildPayload({ ballotCount: 'abc' }))
  ).toThrow('Invalid ballot count format');
  expect(() =>
    decodeQuickResultsMessage(buildPayload({ ballotCount: '-1' }))
  ).toThrow('Invalid ballot count format');

  // votingType must be a valid digit mapping to a known type
  expect(() =>
    decodeQuickResultsMessage(buildPayload({ votingType: 'abc' }))
  ).toThrow('Invalid voting type format');
  expect(() =>
    decodeQuickResultsMessage(buildPayload({ votingType: '99' }))
  ).toThrow('Invalid voting type format');
  expect(() =>
    decodeQuickResultsMessage(buildPayload({ votingType: '-1' }))
  ).toThrow('Invalid voting type format');
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
        ballotCount: 42,
        votingType: 'election_day',
      })
    )
  );
  expect(decoded).toMatchInlineSnapshot(`
    {
      "ballotCount": 42,
      "ballotHash": "mockBallotHash",
      "encodedCompressedTally": "sampleCompressedTally",
      "isLive": false,
      "machineId": "machineId",
      "numPages": 1,
      "pageIndex": 0,
      "pollsTransitionTime": 2024-01-01T00:00:00.000Z,
      "pollsTransitionType": "close_polls",
      "precinctSelection": {
        "kind": "AllPrecincts",
      },
      "votingType": "election_day",
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
        ballotCount: 15,
        votingType: 'early_voting',
      })
    )
  );
  expect(decoded).toMatchInlineSnapshot(`
    {
      "ballotCount": 15,
      "ballotHash": "mockBallotHash",
      "encodedCompressedTally": "sampleCompressedTally",
      "isLive": false,
      "machineId": "machineId",
      "numPages": 1,
      "pageIndex": 0,
      "pollsTransitionTime": 2024-01-01T00:00:00.000Z,
      "pollsTransitionType": "close_polls",
      "precinctSelection": {
        "kind": "SinglePrecinct",
        "precinctId": "mockPrecinctId",
      },
      "votingType": "early_voting",
    }
  `);
});

test('generateSignedQuickResultsReportingUrl works for reporting polls paused status', async () => {
  const signedQuickResultsReportingUrls =
    await generateSignedQuickResultsReportingUrl(
      {
        electionDefinition,
        isLiveMode: true,
        quickResultsReportingUrl: 'https://example.com',
        results: mockedResults,
        signingMachineId: DEV_MACHINE_ID,
        precinctSelection: { kind: 'AllPrecincts' },
        pollsTransitionType: 'pause_voting',
        votingType: 'election_day',
        pollsTransitionTimestamp: new Date('2024-11-05T12:00:00Z').getTime(),
      },
      vxScanTestConfig
    );
  expect(signedQuickResultsReportingUrls).toHaveLength(1);
  const signedQuickResultsReportingUrl =
    signedQuickResultsReportingUrls[0] as string;

  // We do not need a compressed tally when reporting polls paused status
  expect(compressAndEncodeTally).toHaveBeenCalledTimes(0);
  expect(signedQuickResultsReportingUrl).toMatch(
    /^https:\/\/example.com\?p=.*&s=[^&]+&c=[^&]+$/
  );
  expect(signedQuickResultsReportingUrl).toContain('pause_voting');
});

test('encodeQuickResultsMessage and decodeQuickResultsMessage handle reporting polls open status', () => {
  const encoded = encodeQuickResultsMessage({
    ballotHash: 'mockBallotHash',
    signingMachineId: 'machineId',
    isLiveMode: false,
    timestamp: new Date('2024-01-01T00:00:00Z').getTime() / 1000,
    primaryMessage: 'open_polls',
    precinctSelection: {
      kind: 'SinglePrecinct',
      precinctId: 'mockPrecinctId',
    },
    numPages: 1,
    pageIndex: 0,
    ballotCount: 7,
    votingType: 'election_day',
  });

  expect(encoded).toContain('open_polls');
  const decoded = decodeQuickResultsMessage(
    constructPrefixedMessage(QR_MESSAGE_FORMAT, encoded)
  );
  expect(decoded).toMatchInlineSnapshot(`
    {
      "ballotCount": 7,
      "ballotHash": "mockBallotHash",
      "encodedCompressedTally": "",
      "isLive": false,
      "machineId": "machineId",
      "numPages": 1,
      "pageIndex": 0,
      "pollsTransitionTime": 2024-01-01T00:00:00.000Z,
      "pollsTransitionType": "open_polls",
      "precinctSelection": {
        "kind": "SinglePrecinct",
        "precinctId": "mockPrecinctId",
      },
      "votingType": "election_day",
    }
  `);
});

test('encodeQuickResultsMessage and decodeQuickResultsMessage handle reporting polls paused status', () => {
  const encoded = encodeQuickResultsMessage({
    ballotHash: 'mockBallotHash',
    signingMachineId: 'machineId',
    isLiveMode: false,
    timestamp: new Date('2024-01-01T00:00:00Z').getTime() / 1000,
    primaryMessage: 'pause_voting',
    precinctSelection: {
      kind: 'SinglePrecinct',
      precinctId: 'mockPrecinctId',
    },
    numPages: 1,
    pageIndex: 0,
    ballotCount: 99,
    votingType: 'early_voting',
  });

  expect(encoded).toContain('pause_voting');
  const decoded = decodeQuickResultsMessage(
    constructPrefixedMessage(QR_MESSAGE_FORMAT, encoded)
  );
  expect(decoded).toMatchInlineSnapshot(`
    {
      "ballotCount": 99,
      "ballotHash": "mockBallotHash",
      "encodedCompressedTally": "",
      "isLive": false,
      "machineId": "machineId",
      "numPages": 1,
      "pageIndex": 0,
      "pollsTransitionTime": 2024-01-01T00:00:00.000Z,
      "pollsTransitionType": "pause_voting",
      "precinctSelection": {
        "kind": "SinglePrecinct",
        "precinctId": "mockPrecinctId",
      },
      "votingType": "early_voting",
    }
  `);
});

test('encodeQuickResultsMessage and decodeQuickResultsMessage handle resume_voting', () => {
  const encoded = encodeQuickResultsMessage({
    ballotHash: 'mockBallotHash',
    signingMachineId: 'machineId',
    isLiveMode: true,
    timestamp: new Date('2024-01-01T00:00:00Z').getTime() / 1000,
    primaryMessage: 'resume_voting',
    precinctSelection: {
      kind: 'SinglePrecinct',
      precinctId: 'mockPrecinctId',
    },
    numPages: 1,
    pageIndex: 0,
    ballotCount: 50,
    votingType: 'election_day',
  });

  expect(encoded).toContain('resume_voting');
  const decoded = decodeQuickResultsMessage(
    constructPrefixedMessage(QR_MESSAGE_FORMAT, encoded)
  );
  expect(decoded).toMatchInlineSnapshot(`
    {
      "ballotCount": 50,
      "ballotHash": "mockBallotHash",
      "encodedCompressedTally": "",
      "isLive": true,
      "machineId": "machineId",
      "numPages": 1,
      "pageIndex": 0,
      "pollsTransitionTime": 2024-01-01T00:00:00.000Z,
      "pollsTransitionType": "resume_voting",
      "precinctSelection": {
        "kind": "SinglePrecinct",
        "precinctId": "mockPrecinctId",
      },
      "votingType": "election_day",
    }
  `);
});

test('decodeQuickResultsMessage handles old polls_open primaryMessage for backwards compatibility', () => {
  const encoded = encodeQuickResultsMessage({
    ballotHash: 'mockBallotHash',
    signingMachineId: 'machineId',
    isLiveMode: false,
    timestamp: new Date('2024-01-01T00:00:00Z').getTime() / 1000,
    primaryMessage: 'polls_open',
    precinctSelection: { kind: 'AllPrecincts' },
    numPages: 1,
    pageIndex: 0,
    ballotCount: 0,
    votingType: 'election_day',
  });

  const decoded = decodeQuickResultsMessage(
    constructPrefixedMessage(QR_MESSAGE_FORMAT, encoded)
  );
  expect(decoded.pollsTransitionType).toEqual('open_polls');
  expect(decoded.encodedCompressedTally).toEqual('');
});

test('decodeQuickResultsMessage handles old polls_paused primaryMessage for backwards compatibility', () => {
  const encoded = encodeQuickResultsMessage({
    ballotHash: 'mockBallotHash',
    signingMachineId: 'machineId',
    isLiveMode: false,
    timestamp: new Date('2024-01-01T00:00:00Z').getTime() / 1000,
    primaryMessage: 'polls_paused',
    precinctSelection: { kind: 'AllPrecincts' },
    numPages: 1,
    pageIndex: 0,
    ballotCount: 0,
    votingType: 'election_day',
  });

  const decoded = decodeQuickResultsMessage(
    constructPrefixedMessage(QR_MESSAGE_FORMAT, encoded)
  );
  expect(decoded.pollsTransitionType).toEqual('pause_voting');
  expect(decoded.encodedCompressedTally).toEqual('');
});

test('decodeQuickResultsMessage handles v1 (qr1) messages without ballotCount, defaults votingType to election_day', () => {
  // Simulate a qr1 message with 8 fields as older VxScan would generate
  const v1MessageParts = [
    encodeURIComponent('mockBallotHash'),
    encodeURIComponent('machineId'),
    '0',
    (new Date('2024-01-01T00:00:00Z').getTime() / 1000).toString(),
    'polls_open',
    encodeURIComponent('mockPrecinctId'),
    '1',
    '0',
  ];
  // Null byte separator used in the QR message format
  const v1Payload = v1MessageParts.join('\x00');
  const decoded = decodeQuickResultsMessage(
    constructPrefixedMessage(QR_MESSAGE_FORMAT_V1, v1Payload)
  );
  expect(decoded).toMatchInlineSnapshot(`
    {
      "ballotCount": undefined,
      "ballotHash": "mockBallotHash",
      "encodedCompressedTally": "",
      "isLive": false,
      "machineId": "machineId",
      "numPages": 1,
      "pageIndex": 0,
      "pollsTransitionType": "open_polls",
      "precinctSelection": {
        "kind": "SinglePrecinct",
        "precinctId": "mockPrecinctId",
      },
      "reportCreatedAt": 2024-01-01T00:00:00.000Z,
      "votingType": "election_day",
    }
  `);
});

test('encodeQuickResultsMessage and decodeQuickResultsMessage handle absentee voting type', () => {
  const decoded = decodeQuickResultsMessage(
    constructPrefixedMessage(
      QR_MESSAGE_FORMAT,
      encodeQuickResultsMessage({
        ballotHash: 'mockBallotHash',
        signingMachineId: 'machineId',
        isLiveMode: true,
        timestamp: new Date('2024-01-01T00:00:00Z').getTime() / 1000,
        primaryMessage: 'sampleCompressedTally',
        precinctSelection: { kind: 'AllPrecincts' },
        numPages: 1,
        pageIndex: 0,
        ballotCount: 5,
        votingType: 'absentee',
      })
    )
  );
  expect(decoded).toMatchInlineSnapshot(`
    {
      "ballotCount": 5,
      "ballotHash": "mockBallotHash",
      "encodedCompressedTally": "sampleCompressedTally",
      "isLive": true,
      "machineId": "machineId",
      "numPages": 1,
      "pageIndex": 0,
      "pollsTransitionTime": 2024-01-01T00:00:00.000Z,
      "pollsTransitionType": "close_polls",
      "precinctSelection": {
        "kind": "AllPrecincts",
      },
      "votingType": "absentee",
    }
  `);
});
