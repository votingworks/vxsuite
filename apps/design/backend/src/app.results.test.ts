import { afterAll, beforeEach, expect, test, vi } from 'vitest';
import {
  ALL_PRECINCTS_SELECTION,
  buildElectionResultsFixture,
  compressAndEncodeTally,
  ContestResultsSummary,
  ContestResultsSummaries,
  encodeCompressedTally,
  getFeatureFlagMock,
  singlePrecinctSelectionFor,
  getContestsForPrecinct,
  getContestsForPrecinctAndElection,
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
import { electionWithMsEitherNeitherFixtures } from '@votingworks/fixtures';
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
  electionWithMsEitherNeitherFixtures.readElectionDefinition(); // An election that has multiple districts and precincts with different contests

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

  // Before the election is exported we can not view quick results.
  const storedResults = await apiClient.getQuickReportedResults({
    electionId,
    isLive: true,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  expect(storedResults).toEqual(err('election-not-exported'));

  const electionPackageFilePath = await exportElectionPackage({
    electionId,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: false,
    fileStorageClient,
    apiClient,
    workspace,
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
      precinctSelection: ALL_PRECINCTS_SELECTION,
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
      precinctSelection: ALL_PRECINCTS_SELECTION,
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
      precinctSelection: ALL_PRECINCTS_SELECTION,
      compressedTally: encodedTally,
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(result.err()).toEqual('no-election-found');
});

test('quick results reporting works e2e with all precinct reports', async () => {
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
  const encodedTally = compressAndEncodeTally({
    election: sampleElectionDefinition.election,
    results: mockResults,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });

  const result = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr1//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'machineId',
      timestamp: new Date('2024-01-01T12:00:00Z').getTime() / 1000,
      isLiveMode: true,
      precinctSelection: ALL_PRECINCTS_SELECTION,
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
      precinctSelection: ALL_PRECINCTS_SELECTION,
      contestResults: mockResults.contestResults,
    })
  );

  auth0.setLoggedInUser(nonVxUser);
  // Test that the results were actually stored in the database
  const storedResults = await apiClient.getQuickReportedResults({
    electionId: sampleElectionDefinition.election.id,
    isLive: true,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  expect(storedResults).toEqual(
    ok({
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      ballotHash: sampleElectionDefinition.ballotHash,
      contestResults: mockResults.contestResults,
      machinesReporting: ['machineId'],
    })
  );

  // Calling with the same data multiple times should return the same result.
  const result2 = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr1//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'machineId',
      timestamp: new Date('2024-01-01T12:00:00Z').getTime() / 1000,
      isLiveMode: true,
      compressedTally: encodedTally,
      precinctSelection: ALL_PRECINCTS_SELECTION,
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
  const sampleContestResultsDoubled: Record<ContestId, ContestResultsSummary> =
    {
      [sampleContest.id]: {
        type: 'candidate',
        ballots: 20,
        undervotes: 10,
        overvotes: 4,
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
  const mockResults2Doubled = buildElectionResultsFixture({
    election: sampleElectionDefinition.election,
    cardCounts: {
      bmd: 0,
      hmpb: [],
    },
    contestResultsSummaries: sampleContestResultsDoubled,
    includeGenericWriteIn: true,
  });
  const encodedTally2 = compressAndEncodeTally({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    election: sampleElectionDefinition.election,
    results: mockResults2,
  });

  // Calling with updated data should overwrite the previous result.
  const result3 = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr1//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'machineId',
      timestamp: new Date('2024-01-02T12:00:00Z').getTime() / 1000,
      isLiveMode: true,
      compressedTally: encodedTally2,
      precinctSelection: ALL_PRECINCTS_SELECTION,
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
      precinctSelection: ALL_PRECINCTS_SELECTION,
      contestResults: mockResults2.contestResults,
    })
  );
  const storedResults2 = await apiClient.getQuickReportedResults({
    electionId: sampleElectionDefinition.election.id,
    isLive: true,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  expect(storedResults2).toEqual(
    ok({
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      ballotHash: sampleElectionDefinition.ballotHash,
      contestResults: mockResults2.contestResults,
      machinesReporting: ['machineId'],
    })
  );

  // Since all reports are for all precincts querying data for a specific precinct should always be empty data.
  for (const precinct of sampleElectionDefinition.election.precincts) {
    const storedResultsForPrecinct = await apiClient.getQuickReportedResults({
      electionId: sampleElectionDefinition.election.id,
      isLive: true,
      precinctSelection: singlePrecinctSelectionFor(precinct.id),
    });
    expect(storedResultsForPrecinct).toEqual(
      ok({
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        ballotHash: sampleElectionDefinition.ballotHash,
        contestResults: expect.anything(),
        machinesReporting: [],
      })
    );
    const contestResultsForPrecinct =
      storedResultsForPrecinct.unsafeUnwrap().contestResults;
    for (const contest of getContestsForPrecinctAndElection(
      sampleElectionDefinition.election,
      singlePrecinctSelectionFor(precinct.id)
    )) {
      expect(contestResultsForPrecinct).toHaveProperty(contest.id);
      expect(contestResultsForPrecinct[contest.id]).toEqual(
        expect.objectContaining({
          contestId: contest.id,
          ballots: 0,
        })
      );
    }
  }

  // Report from a different machine should be added to the list of machines reporting
  const result4 = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr1//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'machineId-2',
      timestamp: new Date('2024-01-02T12:00:00Z').getTime() / 1000,
      isLiveMode: true,
      compressedTally: encodedTally2,
      precinctSelection: ALL_PRECINCTS_SELECTION,
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(result4).toEqual(ok(expect.anything()));
  const storedResults3 = await apiClient.getQuickReportedResults({
    electionId: sampleElectionDefinition.election.id,
    isLive: true,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  expect(storedResults3).toEqual(
    ok({
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      ballotHash: sampleElectionDefinition.ballotHash,
      contestResults: mockResults2Doubled.contestResults,
      machinesReporting: ['machineId', 'machineId-2'],
    })
  );
});

test('quick results reporting works as expected end to end with single precinct reports', async () => {
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

  // Use the first two precincts from the loaded election (whatever they are after processing)
  const firstPrecinctId = assertDefined(
    sampleElectionDefinition.election.precincts.find((p) =>
      p.name.startsWith('District 5')
    )?.id
  );
  const secondPrecinctId = assertDefined(
    sampleElectionDefinition.election.precincts.find((p) =>
      p.name.startsWith('East Weir')
    )?.id
  );
  const expectedPrecinct1Contests = getContestsForPrecinct(
    sampleElectionDefinition,
    singlePrecinctSelectionFor(firstPrecinctId)
  );
  const expectedPrecinct2Contests = getContestsForPrecinct(
    sampleElectionDefinition,
    singlePrecinctSelectionFor(secondPrecinctId)
  );
  // Ensure we are testing with precincts that have different contests
  expect(expectedPrecinct1Contests).not.toEqual(expectedPrecinct2Contests);

  // Use the first contest from the loaded election for simple results
  const sampleContest = sampleElectionDefinition.election.contests[0];
  const sampleContestResults: ContestResultsSummaries = {
    [sampleContest.id]: {
      type: 'candidate',
      ballots: 10,
      undervotes: 1,
      overvotes: 2,
      officialOptionTallies: {},
    },
  };

  // Create mock results for first precinct
  const mockResultsFirstPrecinct = buildElectionResultsFixture({
    election: sampleElectionDefinition.election,
    cardCounts: {
      bmd: 0,
      hmpb: [],
    },
    contestResultsSummaries: sampleContestResults,
    includeGenericWriteIn: true,
  });

  // Create mock results for second precinct
  const mockResultsSecondPrecinct = buildElectionResultsFixture({
    election: sampleElectionDefinition.election,
    cardCounts: {
      bmd: 0,
      hmpb: [],
    },
    contestResultsSummaries: sampleContestResults,
    includeGenericWriteIn: true,
  });

  // Report data from first precinct
  const encodedTallyFirstPrecinct = compressAndEncodeTally({
    election: sampleElectionDefinition.election,
    results: mockResultsFirstPrecinct,
    precinctSelection: singlePrecinctSelectionFor(firstPrecinctId),
  });

  const resultFirstPrecinct =
    await unauthenticatedApiClient.processQrCodeReport({
      payload: `1//qr1//${encodeQuickResultsMessage({
        ballotHash: sampleElectionDefinition.ballotHash,
        signingMachineId: 'first-precinct-machine',
        timestamp: new Date('2024-01-01T12:00:00Z').getTime() / 1000,
        isLiveMode: true,
        precinctSelection: singlePrecinctSelectionFor(firstPrecinctId),
        compressedTally: encodedTallyFirstPrecinct,
      })}`,
      signature: 'test-signature',
      certificate: 'test-certificate',
    });

  expect(resultFirstPrecinct).toEqual(
    ok(
      expect.objectContaining({
        ballotHash: sampleElectionDefinition.ballotHash,
        machineId: 'first-precinct-machine',
        isLive: true,
        signedTimestamp: new Date('2024-01-01T12:00:00Z'),
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        precinctSelection: singlePrecinctSelectionFor(firstPrecinctId),
        contestResults: expect.objectContaining({
          [sampleContest.id]: expect.objectContaining({
            ballots: 10,
            undervotes: 1,
            overvotes: 2,
          }),
        }),
      })
    )
  );
  // Report data from second precinct
  const encodedTallySecondPrecinct = compressAndEncodeTally({
    election: sampleElectionDefinition.election,
    results: mockResultsSecondPrecinct,
    precinctSelection: singlePrecinctSelectionFor(secondPrecinctId),
  });

  const resultSecondPrecinct =
    await unauthenticatedApiClient.processQrCodeReport({
      payload: `1//qr1//${encodeQuickResultsMessage({
        ballotHash: sampleElectionDefinition.ballotHash,
        signingMachineId: 'second-precinct-machine',
        timestamp: new Date('2024-01-01T13:00:00Z').getTime() / 1000,
        isLiveMode: true,
        precinctSelection: singlePrecinctSelectionFor(secondPrecinctId),
        compressedTally: encodedTallySecondPrecinct,
      })}`,
      signature: 'test-signature',
      certificate: 'test-certificate',
    });

  expect(resultSecondPrecinct).toEqual(
    ok(
      expect.objectContaining({
        ballotHash: sampleElectionDefinition.ballotHash,
        machineId: 'second-precinct-machine',
        isLive: true,
        signedTimestamp: new Date('2024-01-01T13:00:00Z'),
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        precinctSelection: singlePrecinctSelectionFor(secondPrecinctId),
        contestResults: expect.objectContaining({
          [sampleContest.id]: expect.objectContaining({
            ballots: 10,
            undervotes: 1,
            overvotes: 2,
          }),
        }),
      })
    )
  );

  auth0.setLoggedInUser(nonVxUser);

  // Verify getting results for first precinct individually
  const storedResultsFirstPrecinct = await apiClient.getQuickReportedResults({
    electionId: sampleElectionDefinition.election.id,
    isLive: true,
    precinctSelection: singlePrecinctSelectionFor(firstPrecinctId),
  });
  expect(storedResultsFirstPrecinct).toEqual(
    ok(
      expect.objectContaining({
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        ballotHash: sampleElectionDefinition.ballotHash,
        contestResults: expect.objectContaining({
          [sampleContest.id]: expect.objectContaining({
            ballots: 10,
            undervotes: 1,
            overvotes: 2,
          }),
        }),
        machinesReporting: ['first-precinct-machine'],
      })
    )
  );
  const contestResultsFirstPrecinct =
    storedResultsFirstPrecinct.ok()?.contestResults;
  expect(Object.keys(assertDefined(contestResultsFirstPrecinct))).toEqual(
    expectedPrecinct1Contests.map((c) => c.id)
  );

  // Verify getting results for second precinct individually
  const storedResultsSecondPrecinct = await apiClient.getQuickReportedResults({
    electionId: sampleElectionDefinition.election.id,
    isLive: true,
    precinctSelection: singlePrecinctSelectionFor(secondPrecinctId),
  });
  expect(storedResultsSecondPrecinct).toEqual(
    ok(
      expect.objectContaining({
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        ballotHash: sampleElectionDefinition.ballotHash,
        contestResults: expect.objectContaining({
          [sampleContest.id]: expect.objectContaining({
            ballots: 10,
            undervotes: 1,
            overvotes: 2,
          }),
        }),
        machinesReporting: ['second-precinct-machine'],
      })
    )
  );
  const contestResultsSecondPrecinct =
    storedResultsSecondPrecinct.ok()?.contestResults;
  expect(Object.keys(assertDefined(contestResultsSecondPrecinct))).toEqual(
    expectedPrecinct2Contests.map((c) => c.id)
  );

  // Verify getting results for all precincts aggregates the single-precinct reports correctly
  const storedResultsAllPrecincts = await apiClient.getQuickReportedResults({
    electionId: sampleElectionDefinition.election.id,
    isLive: true,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });

  expect(storedResultsAllPrecincts).toEqual(
    ok(
      expect.objectContaining({
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        ballotHash: sampleElectionDefinition.ballotHash,
        contestResults: expect.objectContaining({
          [sampleContest.id]: expect.objectContaining({
            ballots: 20, // 10 + 10 from both precincts
            undervotes: 2, // 1 + 1 from both precincts
            overvotes: 4, // 2 + 2 from both precincts
          }),
        }),
        machinesReporting: expect.arrayContaining([
          'first-precinct-machine',
          'second-precinct-machine',
        ]),
      })
    )
  );
  const contestResultsAllPrecincts =
    storedResultsAllPrecincts.ok()?.contestResults;
  expect(Object.keys(assertDefined(contestResultsAllPrecincts))).toEqual(
    sampleElectionDefinition.election.contests.map((c) => c.id)
  );

  // Verify that querying for a precinct with no reports returns empty results
  const thirdPrecinctId = sampleElectionDefinition.election.precincts.find(
    (p) => p.name.includes('Chester')
  )?.id;
  if (thirdPrecinctId) {
    const storedResultsThirdPrecinct = await apiClient.getQuickReportedResults({
      electionId: sampleElectionDefinition.election.id,
      isLive: true,
      precinctSelection: singlePrecinctSelectionFor(thirdPrecinctId),
    });
    expect(storedResultsThirdPrecinct).toEqual(
      ok(
        expect.objectContaining({
          election: expect.objectContaining({
            id: sampleElectionDefinition.election.id,
          }),
          ballotHash: sampleElectionDefinition.ballotHash,
          contestResults: expect.anything(), // checked separately
          machinesReporting: [],
        })
      )
    );
    const contestResultsThirdPrecinct =
      storedResultsThirdPrecinct.ok()?.contestResults;
    expect(Object.keys(assertDefined(contestResultsThirdPrecinct))).toEqual(
      getContestsForPrecinctAndElection(
        sampleElectionDefinition.election,
        singlePrecinctSelectionFor(thirdPrecinctId)
      ).map((c) => c.id)
    );
  }

  // Report data from an all precincts machine and re-verify all gets
  const mockResultsAllPrecincts = buildElectionResultsFixture({
    election: sampleElectionDefinition.election,
    cardCounts: {
      bmd: 0,
      hmpb: [],
    },
    contestResultsSummaries: {
      [sampleContest.id]: {
        type: 'candidate',
        ballots: 50,
        undervotes: 5,
        overvotes: 3,
        officialOptionTallies: {},
      },
    },
    includeGenericWriteIn: true,
  });

  const encodedTallyAllPrecincts = compressAndEncodeTally({
    election: sampleElectionDefinition.election,
    results: mockResultsAllPrecincts,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });

  const resultAllPrecincts = await unauthenticatedApiClient.processQrCodeReport(
    {
      payload: `1//qr1//${encodeQuickResultsMessage({
        ballotHash: sampleElectionDefinition.ballotHash,
        signingMachineId: 'allprecincts-machine',
        timestamp: new Date('2024-01-01T14:00:00Z').getTime() / 1000,
        isLiveMode: true,
        precinctSelection: ALL_PRECINCTS_SELECTION,
        compressedTally: encodedTallyAllPrecincts,
      })}`,
      signature: 'test-signature',
      certificate: 'test-certificate',
    }
  );

  expect(resultAllPrecincts).toEqual(ok(expect.anything()));

  // After all-precincts report, individual precinct results should still be available
  const finalStoredResultsFirstPrecinct =
    await apiClient.getQuickReportedResults({
      electionId: sampleElectionDefinition.election.id,
      isLive: true,
      precinctSelection: singlePrecinctSelectionFor(firstPrecinctId),
    });
  expect(finalStoredResultsFirstPrecinct).toEqual(
    ok(
      expect.objectContaining({
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        ballotHash: sampleElectionDefinition.ballotHash,
        contestResults: expect.objectContaining({
          [sampleContest.id]: expect.objectContaining({
            ballots: 10, // Single precinct results
            undervotes: 1,
            overvotes: 2,
          }),
        }),
        machinesReporting: ['first-precinct-machine'],
      })
    )
  );

  // All precincts results should now show the all-precincts report data
  const finalStoredResultsAllPrecincts =
    await apiClient.getQuickReportedResults({
      electionId: sampleElectionDefinition.election.id,
      isLive: true,
      precinctSelection: ALL_PRECINCTS_SELECTION,
    });
  expect(finalStoredResultsAllPrecincts).toEqual(
    ok(
      expect.objectContaining({
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        contestResults: expect.objectContaining({
          [sampleContest.id]: expect.objectContaining({
            ballots: 70,
          }),
        }),
        machinesReporting: [
          'allprecincts-machine',
          'second-precinct-machine',
          'first-precinct-machine',
        ],
      })
    )
  );
});

test('deleteQuickReportingResults clears quick results data as expected', async () => {
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

  // Create and submit some quick results data
  const sampleContest = sampleElectionDefinition.election.contests[0];
  const sampleContestResults: Record<ContestId, ContestResultsSummary> = {
    [sampleContest.id]: {
      type: 'candidate',
      ballots: 15,
      undervotes: 3,
      overvotes: 1,
      officialOptionTallies: {},
    },
  };
  const mockResults = buildElectionResultsFixture({
    election: sampleElectionDefinition.election,
    cardCounts: {
      bmd: 0,
      hmpb: [],
    },
    contestResultsSummaries: sampleContestResults,
    includeGenericWriteIn: true,
  });
  const encodedTally = compressAndEncodeTally({
    election: sampleElectionDefinition.election,
    results: mockResults,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });

  // Submit live results
  const result = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr1//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'test-machine-live',
      timestamp: new Date('2024-01-01T12:00:00Z').getTime() / 1000,
      isLiveMode: true,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      compressedTally: encodedTally,
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(result).toEqual(ok(expect.anything()));

  // Submit test results (isLiveMode: false)
  const testResult = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr1//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'test-machine-test',
      timestamp: new Date('2024-01-01T13:00:00Z').getTime() / 1000,
      isLiveMode: false,
      precinctSelection: ALL_PRECINCTS_SELECTION,
      compressedTally: encodedTally,
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(testResult).toEqual(ok(expect.anything()));

  auth0.setLoggedInUser(nonVxUser);

  // Verify both live and test results exist before clearing
  const storedLiveResults = await apiClient.getQuickReportedResults({
    electionId: sampleElectionDefinition.election.id,
    isLive: true,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  expect(storedLiveResults).toEqual(
    ok({
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      ballotHash: sampleElectionDefinition.ballotHash,
      contestResults: expect.objectContaining({
        [sampleContest.id]: expect.objectContaining({
          ballots: 15,
          undervotes: 3,
          overvotes: 1,
        }),
      }),
      machinesReporting: ['test-machine-live'],
    })
  );

  const storedTestResults = await apiClient.getQuickReportedResults({
    electionId: sampleElectionDefinition.election.id,
    isLive: false,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  expect(storedTestResults).toEqual(
    ok({
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      ballotHash: sampleElectionDefinition.ballotHash,
      contestResults: expect.objectContaining({
        [sampleContest.id]: expect.objectContaining({
          ballots: 15,
          undervotes: 3,
          overvotes: 1,
        }),
      }),
      machinesReporting: ['test-machine-test'],
    })
  );

  // Clear live results only
  await apiClient.deleteQuickReportingResults({
    electionId: sampleElectionDefinition.election.id,
    isLive: true,
  });

  // Verify live results are cleared but test results remain
  const clearedLiveResults = await apiClient.getQuickReportedResults({
    electionId: sampleElectionDefinition.election.id,
    isLive: true,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  expect(clearedLiveResults).toEqual(ok(expect.anything()));
  expect(clearedLiveResults.ok()?.machinesReporting).toEqual([]);
  // When cleared, contest results should exist but have zero values
  const liveContestResults = clearedLiveResults.ok()?.contestResults;
  expect(liveContestResults).toBeDefined();
  for (const contestResult of Object.values(liveContestResults!)) {
    expect(contestResult.ballots).toEqual(0);
    expect(contestResult.overvotes).toEqual(0);
    expect(contestResult.undervotes).toEqual(0);
  }

  const remainingTestResults = await apiClient.getQuickReportedResults({
    electionId: sampleElectionDefinition.election.id,
    isLive: false,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  expect(remainingTestResults).toEqual(
    ok({
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      ballotHash: sampleElectionDefinition.ballotHash,
      contestResults: expect.objectContaining({
        [sampleContest.id]: expect.objectContaining({
          ballots: 15,
          undervotes: 3,
          overvotes: 1,
        }),
      }),
      machinesReporting: ['test-machine-test'],
    })
  );

  // Clear test results
  await apiClient.deleteQuickReportingResults({
    electionId: sampleElectionDefinition.election.id,
    isLive: false,
  });

  // Verify test results are now also cleared
  const clearedTestResults = await apiClient.getQuickReportedResults({
    electionId: sampleElectionDefinition.election.id,
    isLive: false,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  expect(clearedTestResults).toEqual(ok(expect.anything()));
  expect(clearedTestResults.ok()?.machinesReporting).toEqual([]);
  // When cleared, contest results should exist but have zero values
  const testContestResults = clearedTestResults.ok()?.contestResults;
  expect(testContestResults).toBeDefined();
  for (const contestResult of Object.values(testContestResults!)) {
    expect(contestResult.ballots).toEqual(0);
    expect(contestResult.overvotes).toEqual(0);
    expect(contestResult.undervotes).toEqual(0);
  }
});
