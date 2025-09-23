import { afterAll, beforeEach, expect, test, vi } from 'vitest';
import {
  buildElectionResultsFixture,
  compressTally,
  ContestResultsSummary,
  encodeCompressedTally,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { assertDefined, err, ok, Result } from '@votingworks/basics';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import {
  CompressedTally,
  ContestId,
  ElectionDefinition,
  ElectionId,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { encodeQuickResultsMessage } from '@votingworks/auth';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { join } from 'node:path';
import { readElectionPackageFromBuffer } from '@votingworks/backend';
import { renderAllBallotPdfsAndCreateElectionDefinition } from '@votingworks/hmpb';
import {
  ApiClient,
  exportElectionPackage,
  MockFileStorageClient,
  testSetupHelpers,
  unzipElectionPackageAndBallots,
} from '../test/helpers';
import { Org, User } from './types';
import { Workspace } from './workspace';

const mockFeatureFlagger = getFeatureFlagMock();

const { setupApp, cleanup } = testSetupHelpers();

const nonVxOrg: Org = {
  id: 'other-org-id',
  name: 'Other Org',
};
const nonVxUser: User = {
  name: 'non.vx.user@example.com',
  auth0Id: 'auth0|non-vx-user-id',
  orgId: nonVxOrg.id,
};
afterAll(cleanup);

// Mock the authentication function so we can control its behavior in tests
let mockAuthReturnValue: Result<void, 'invalid-signature'> = ok();
vi.mock('@votingworks/auth', async (importActual) => ({
  ...(await importActual()),
  authenticateSignedQuickResultsReportingUrl: vi
    .fn()
    .mockImplementation(() => mockAuthReturnValue),
}));

vi.mock(import('@votingworks/hmpb'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    renderAllBallotPdfsAndCreateElectionDefinition: vi.fn(
      original.renderAllBallotPdfsAndCreateElectionDefinition
    ),
  } as unknown as typeof original;
});

beforeEach(() => {
  mockAuthReturnValue = ok();
  mockFeatureFlagger.resetFeatureFlags();
});

const baseElectionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();

async function setUpElectionInSystem(
  apiClient: ApiClient,
  workspace: Workspace,
  fileStorageClient: MockFileStorageClient
): Promise<ElectionDefinition> {
  // Mock rendering of ballot PDFs since we don't need to test that here
  // We do need to return the election definition provided to this function to make sure
  // the regenerated-ids are in the election we save to the package.
  vi.mocked(renderAllBallotPdfsAndCreateElectionDefinition).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/require-await
    async (_, _ballotTemplates, ballotProps) => ({
      ballotPdfs: ballotProps.map(() => Uint8Array.from('mock-pdf-contents')),
      electionDefinition: safeParseElectionDefinition(
        JSON.stringify(ballotProps[0].election, null, 2)
      ).unsafeUnwrap(),
    })
  );
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      orgId: nonVxUser.orgId,
      electionData: JSON.stringify(baseElectionDefinition.election, null, 2),
    })
  ).unsafeUnwrap();

  const electionPackageFilePath = await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
  });
  const contents = assertDefined(
    fileStorageClient.getRawFile(join(nonVxUser.orgId, electionPackageFilePath))
  );
  const { electionPackageContents } =
    await unzipElectionPackageAndBallots(contents);
  const { electionPackage } = (
    await readElectionPackageFromBuffer(electionPackageContents)
  ).unsafeUnwrap();
  const { electionDefinition } = electionPackage;
  return electionDefinition;
}

test('processQRCodeReport handles invalid payloads as expected', async () => {
  // You can call processQrCodeReport without authentication
  const {
    unauthenticatedApiClient,
    apiClient,
    workspace,
    fileStorageClient,
    auth0,
  } = await setupApp([nonVxOrg]);
  auth0.setLoggedInUser(nonVxUser);
  const sampleElectionDefinition = await setUpElectionInSystem(
    apiClient,
    workspace,
    fileStorageClient
  );
  auth0.logOut();

  const invalidPayloads = [
    'bad-payload', // No separator
    '0//qr1//message', // Bad version
    '1//bad-header//message', // Bad header
    '1//qr1//', // No message
    `1//qr1//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'machineId',
      timestamp: new Date().getTime(),
      isLiveMode: true,
      compressedTally: 'notbase64encoded',
    })}`, // Bad data
  ];
  for (const payload of invalidPayloads) {
    await suppressingConsoleOutput(async () => {
      const result = await unauthenticatedApiClient.processQrCodeReport({
        payload,
        signature: 'test-signature',
        certificate: 'test-certificate',
      });
      expect(result.err()).toEqual('invalid-payload');
    });
  }
});

test('processQRCodeReport returns "invalid-signature" when authenticating the signature and certificate fails', async () => {
  const { unauthenticatedApiClient } = await setupApp([]);
  // You can call processQrCodeReport without authentication
  const mockCompressedTally = [
    [0, 4, 5, 6, 1],
    [1, 1, 3, 5],
    [0, 0, 0, 0],
  ] as CompressedTally;
  const encodedTally = encodeCompressedTally(mockCompressedTally);

  mockAuthReturnValue = err('invalid-signature');

  const result = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr1//${encodeQuickResultsMessage({
      ballotHash: 'ballotHash',
      signingMachineId: 'machineId',
      timestamp: -1,
      isLiveMode: false,
      compressedTally: encodedTally,
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(result.err()).toEqual('invalid-signature');
});

test('processQRCodeReport returns no election found where there is no election for the given ballot hash', async () => {
  const { unauthenticatedApiClient } = await setupApp([]);
  // You can call processQrCodeReport without authentication
  const mockCompressedTally = [
    [0, 4, 5, 6, 1],
    [1, 1, 3, 5],
    [0, 0, 0, 0],
  ] as CompressedTally;
  const encodedTally = encodeCompressedTally(mockCompressedTally);

  const result = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr1//${encodeQuickResultsMessage({
      ballotHash: 'ballotHash',
      signingMachineId: 'machineId',
      timestamp: -1,
      isLiveMode: false,
      compressedTally: encodedTally,
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(result.err()).toEqual('no-election-found');
});

test('processQRCodeReport processes a valid quick results report successfully', async () => {
  const {
    unauthenticatedApiClient,
    apiClient,
    workspace,
    fileStorageClient,
    auth0,
  } = await setupApp([nonVxOrg]);
  auth0.setLoggedInUser(nonVxUser);
  const sampleElectionDefinition = await setUpElectionInSystem(
    apiClient,
    workspace,
    fileStorageClient
  );
  auth0.logOut();

  const mockResults = buildElectionResultsFixture({
    election: sampleElectionDefinition.election,
    cardCounts: {
      bmd: 0,
      hmpb: [],
    },
    contestResultsSummaries: {},
    includeGenericWriteIn: true,
  });
  const encodedTally = compressTally(
    sampleElectionDefinition.election,
    mockResults
  );

  const result = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr1//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'machineId',
      timestamp: new Date('2024-01-01T12:00:00Z').getTime() / 1000,
      isLiveMode: true,
      compressedTally: encodedTally,
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(result).toEqual(
    ok({
      ballotHash: sampleElectionDefinition.ballotHash,
      machineId: 'machineId',
      isLive: true,
      signedTimestamp: new Date('2024-01-01T12:00:00Z'),
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      contestResults: mockResults.contestResults,
    })
  );

  // Test that the results were actually stored in the database
  // TODO (#7158) - Change this to call the apiClient method to get results when that is implemented
  const electionRecord = await workspace.store.getElection(
    sampleElectionDefinition.election.id
  );
  assertDefined(electionRecord);
  const storedResults =
    await workspace.store.getQuickResultsReportingTalliesForElection(
      electionRecord,
      true
    );
  expect(storedResults).toEqual([
    {
      electionId: sampleElectionDefinition.election.id,
      encodedCompressedTally: encodedTally,
      machineId: 'machineId',
      isLive: true,
      signedTimestamp: new Date('2024-01-01T12:00:00Z'),
      precinctId: undefined,
    },
  ]);

  // Calling with the same data multiple times should return the same result.
  const result2 = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr1//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'machineId',
      timestamp: new Date('2024-01-01T12:00:00Z').getTime() / 1000,
      isLiveMode: true,
      compressedTally: encodedTally,
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(result2).toEqual(result);

  const sampleContest = sampleElectionDefinition.election.contests[0];
  const sampleContestResults: Record<ContestId, ContestResultsSummary> = {
    [sampleContest.id]: {
      type: 'candidate',
      ballots: 10,
      undervotes: 5,
      overvotes: 2,
      officialOptionTallies: {},
    },
  };
  const mockResults2 = buildElectionResultsFixture({
    election: sampleElectionDefinition.election,
    cardCounts: {
      bmd: 0,
      hmpb: [],
    },
    contestResultsSummaries: sampleContestResults,
    includeGenericWriteIn: true,
  });
  const encodedTally2 = compressTally(
    sampleElectionDefinition.election,
    mockResults2
  );

  // Calling with updated data should overwrite the previous result.
  const result3 = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr1//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'machineId',
      timestamp: new Date('2024-01-02T12:00:00Z').getTime() / 1000,
      isLiveMode: true,
      compressedTally: encodedTally2,
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(result3).toEqual(
    ok({
      ballotHash: sampleElectionDefinition.ballotHash,
      machineId: 'machineId',
      isLive: true,
      signedTimestamp: new Date('2024-01-02T12:00:00Z'),
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      contestResults: mockResults2.contestResults,
    })
  );
  const storedResults2 =
    await workspace.store.getQuickResultsReportingTalliesForElection(
      electionRecord,
      true
    );
  expect(storedResults2).toEqual([
    {
      electionId: sampleElectionDefinition.election.id,
      encodedCompressedTally: encodedTally2,
      machineId: 'machineId',
      isLive: true,
      signedTimestamp: new Date('2024-01-02T12:00:00Z'),
      precinctId: undefined,
    },
  ]);
});
