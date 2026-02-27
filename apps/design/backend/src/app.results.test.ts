import { afterAll, beforeEach, expect, test, vi } from 'vitest';
import {
  ALL_PRECINCTS_SELECTION,
  buildElectionResultsFixture,
  compressAndEncodeTally,
  compressTally,
  ContestResultsSummary,
  ContestResultsSummaries,
  encodeCompressedTally,
  encodePrecinctBitmap,
  encodeTallyEntries,
  getEmptyElectionResults,
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
  Election,
  ElectionDefinition,
  ElectionId,
  PrecinctId,
  PrecinctSelection,
  safeParseElectionDefinition,
  Tabulation,
} from '@votingworks/types';
import {
  encodeQuickResultsMessage,
  QR_MESSAGE_FORMAT,
} from '@votingworks/auth';
import { electionWithMsEitherNeitherFixtures } from '@votingworks/fixtures';
import { readElectionPackageFromBuffer } from '@votingworks/backend';
import { renderAllBallotPdfsAndCreateElectionDefinition } from '@votingworks/hmpb';
import {
  ApiClient,
  exportElectionPackage,
  getExportedFile,
  MockFileStorageClient,
  testSetupHelpers,
} from '../test/helpers';
import { ALL_PRECINCTS_REPORT_KEY } from './types';
import { Workspace } from './workspace';
import {
  jurisdictions,
  nonVxJurisdiction,
  nonVxUser,
  organizations,
  users,
} from '../test/mocks';

/**
 * Converts total election results into a resultsByPrecinct map suitable for
 * compressAndEncodeTally. Each contest's values are assigned to only the first
 * precinct that includes it, so aggregation reproduces the original totals.
 */
function buildResultsByPrecinct(
  election: Election,
  results: Tabulation.ElectionResults,
  precinctSelection: PrecinctSelection
): Partial<Record<PrecinctId, Tabulation.ElectionResults>> {
  if (precinctSelection.kind === 'SinglePrecinct') {
    return { [precinctSelection.precinctId]: results };
  }

  const emptyResults = getEmptyElectionResults(election);
  const assignedContests = new Set<string>();
  const resultsByPrecinctMap: Partial<
    Record<PrecinctId, Tabulation.ElectionResults>
  > = {};

  for (const precinct of election.precincts) {
    const contests = getContestsForPrecinctAndElection(
      election,
      singlePrecinctSelectionFor(precinct.id)
    );

    const precinctContestResults: Record<
      ContestId,
      Tabulation.ContestResults
    > = {};
    for (const contest of contests) {
      if (!assignedContests.has(contest.id)) {
        precinctContestResults[contest.id] =
          results.contestResults[contest.id] ??
          emptyResults.contestResults[contest.id];
        assignedContests.add(contest.id);
      } else {
        precinctContestResults[contest.id] =
          emptyResults.contestResults[contest.id];
      }
    }

    resultsByPrecinctMap[precinct.id] = {
      ...results,
      contestResults: precinctContestResults,
    };
  }

  return resultsByPrecinctMap;
}

/**
 * Helper to build qr3 payload components from resultsByPrecinct.
 * Returns the encoded tally entries (bitmap-free) and the encoded bitmap.
 */
function encodeQr3TallyComponents(
  election: Election,
  resultsByPrecinct: Partial<Record<PrecinctId, Tabulation.ElectionResults>>
): { tallyEntries: string; bitmap: string } {
  const entries = encodeTallyEntries({
    election,
    resultsByPrecinct,
    numPages: 1,
  });
  return {
    tallyEntries: assertDefined(entries[0]),
    bitmap: encodePrecinctBitmap(election, resultsByPrecinct),
  };
}

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
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: JSON.stringify(
          baseElectionDefinition.election,
          null,
          2
        ),
      },
    })
  ).unsafeUnwrap();

  // Before the election is exported we can not view quick results or polls status.
  const storedResults = await apiClient.getLiveResultsReports({
    electionId,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  expect(storedResults).toEqual(err('no-election-export-found'));

  const storedPollStatus = await apiClient.getLiveReportsSummary({
    electionId,
  });
  expect(storedPollStatus).toEqual(err('no-election-export-found'));

  const exportMeta = await exportElectionPackage({
    electionId,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: false,
    shouldExportTestBallots: false,
    numAuditIdBallots: undefined,
    fileStorageClient,
    apiClient,
    workspace,
  });
  const electionPackageContents = getExportedFile({
    storage: fileStorageClient,
    jurisdictionId: nonVxJurisdiction.id,
    url: exportMeta.electionPackageUrl,
  });
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
  } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
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
    '1//qr3//', // No message
    `1//qr3//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'machineId',
      timestamp: new Date().getTime(),
      isLiveMode: true,
      encodedPrecinctBitmap: '',
      primaryMessage: 'notbase64encoded',
      numPages: 1,
      pageIndex: 0,
      ballotCount: 0,
      votingType: 'election_day',
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
  const { unauthenticatedApiClient } = await setupApp({
    organizations,
    jurisdictions: [],
    users: [],
  });
  // You can call processQrCodeReport without authentication
  const mockCompressedTally = [
    [0, 4, 5, 6, 1],
    [1, 1, 3, 5],
    [0, 0, 0, 0],
  ] as CompressedTally;
  const encodedTally = encodeCompressedTally(mockCompressedTally, 1)[0];

  mockAuthReturnValue = err('invalid-signature');

  const result = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr3//${encodeQuickResultsMessage({
      ballotHash: 'ballotHash',
      signingMachineId: 'machineId',
      timestamp: -1,
      isLiveMode: false,
      encodedPrecinctBitmap: '',
      primaryMessage: encodedTally,
      numPages: 1,
      pageIndex: 0,
      ballotCount: 0,
      votingType: 'election_day',
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(result.err()).toEqual('invalid-signature');
});

test('processQRCodeReport returns no election found where there is no election for the given ballot hash', async () => {
  const { unauthenticatedApiClient } = await setupApp({
    organizations,
    jurisdictions: [],
    users: [],
  });
  // You can call processQrCodeReport without authentication
  const mockCompressedTally = [
    [0, 4, 5, 6, 1],
    [1, 1, 3, 5],
    [0, 0, 0, 0],
  ] as CompressedTally;
  const encodedTally = encodeCompressedTally(mockCompressedTally, 1)[0];

  const result = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr3//${encodeQuickResultsMessage({
      ballotHash: 'ballotHash',
      signingMachineId: 'machineId',
      timestamp: -1,
      isLiveMode: false,
      encodedPrecinctBitmap: '',
      primaryMessage: encodedTally,
      numPages: 1,
      pageIndex: 0,
      ballotCount: 0,
      votingType: 'election_day',
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(result.err()).toEqual('no-election-export-found');
});

test('quick results reporting works e2e with all precinct reports', async () => {
  const {
    unauthenticatedApiClient,
    apiClient,
    workspace,
    fileStorageClient,
    auth0,
  } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
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
      bmd: [],
      hmpb: [],
    },
    contestResultsSummaries: {},
    includeGenericWriteIn: true,
  });
  const allResultsByPrecinct = buildResultsByPrecinct(
    sampleElectionDefinition.election,
    mockResults,
    ALL_PRECINCTS_SELECTION
  );
  const { tallyEntries: encodedTally, bitmap: allPrecinctsBitmap } =
    encodeQr3TallyComponents(
      sampleElectionDefinition.election,
      allResultsByPrecinct
    );

  const result = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr3//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'machineId',
      timestamp: new Date('2024-01-01T12:00:00Z').getTime() / 1000,
      isLiveMode: true,
      encodedPrecinctBitmap: allPrecinctsBitmap,
      primaryMessage: encodedTally,
      numPages: 1,
      pageIndex: 0,
      ballotCount: 0,
      votingType: 'election_day',
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(result).toEqual(
    ok(
      expect.objectContaining({
        ballotHash: sampleElectionDefinition.ballotHash,
        pollsTransitionType: 'close_polls',
        machineId: 'machineId',
        isLive: true,
        pollsTransitionTime: new Date('2024-01-01T12:00:00Z'),
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        precinctIds: [],
        contestResultsByPrecinct: { '__all': mockResults.contestResults },
      })
    )
  );

  auth0.setLoggedInUser(nonVxUser);
  // Test that the results were actually stored in the database
  const storedResults = await apiClient.getLiveResultsReports({
    electionId: sampleElectionDefinition.election.id,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  expect(storedResults).toEqual(
    ok(
      expect.objectContaining({
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        ballotHash: sampleElectionDefinition.ballotHash,
        contestResults: mockResults.contestResults,
        machinesReporting: ['machineId'],
        isLive: true,
      })
    )
  );

  // Calling with the same data multiple times should return the same result.
  const result2 = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr3//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'machineId',
      timestamp: new Date('2024-01-01T12:00:00Z').getTime() / 1000,
      isLiveMode: true,
      primaryMessage: encodedTally,
      encodedPrecinctBitmap: allPrecinctsBitmap,
      numPages: 1,
      pageIndex: 0,
      ballotCount: 0,
      votingType: 'election_day',
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
      bmd: [],
      hmpb: [],
    },
    contestResultsSummaries: sampleContestResults,
    includeGenericWriteIn: true,
  });
  const mockResults2Doubled = buildElectionResultsFixture({
    election: sampleElectionDefinition.election,
    cardCounts: {
      bmd: [],
      hmpb: [],
    },
    contestResultsSummaries: sampleContestResultsDoubled,
    includeGenericWriteIn: true,
  });
  const allResultsByPrecinct2 = buildResultsByPrecinct(
    sampleElectionDefinition.election,
    mockResults2,
    ALL_PRECINCTS_SELECTION
  );
  const { tallyEntries: encodedTally2, bitmap: allPrecinctsBitmap2 } =
    encodeQr3TallyComponents(
      sampleElectionDefinition.election,
      allResultsByPrecinct2
    );

  // Calling with updated data should overwrite the previous result.
  const result3 = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr3//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'machineId',
      timestamp: new Date('2024-01-02T12:00:00Z').getTime() / 1000,
      isLiveMode: true,
      primaryMessage: encodedTally2,
      encodedPrecinctBitmap: allPrecinctsBitmap2,
      numPages: 1,
      pageIndex: 0,
      ballotCount: 0,
      votingType: 'election_day',
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(result3).toEqual(
    ok(
      expect.objectContaining({
        ballotHash: sampleElectionDefinition.ballotHash,
        machineId: 'machineId',
        isLive: true,
        pollsTransitionType: 'close_polls',
        pollsTransitionTime: new Date('2024-01-02T12:00:00Z'),
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        precinctIds: [],
        contestResultsByPrecinct: { '__all': mockResults2.contestResults },
      })
    )
  );
  const storedResults2 = await apiClient.getLiveResultsReports({
    electionId: sampleElectionDefinition.election.id,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  expect(storedResults2).toEqual(
    ok(
      expect.objectContaining({
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        ballotHash: sampleElectionDefinition.ballotHash,
        contestResults: mockResults2.contestResults,
        machinesReporting: ['machineId'],
        isLive: true,
      })
    )
  );

  // With per-precinct storage, querying for a specific precinct should find per-precinct data.
  for (const precinct of sampleElectionDefinition.election.precincts) {
    const storedResultsForPrecinct = await apiClient.getLiveResultsReports({
      electionId: sampleElectionDefinition.election.id,
      precinctSelection: singlePrecinctSelectionFor(precinct.id),
    });
    expect(storedResultsForPrecinct).toEqual(
      ok({
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        ballotHash: sampleElectionDefinition.ballotHash,
        contestResults: expect.anything(),
        machinesReporting: ['machineId'],
        isLive: true,
      })
    );
  }
  const pollsStatus = await apiClient.getLiveReportsSummary({
    electionId: sampleElectionDefinition.election.id,
  });
  // With per-precinct storage, each precinct has a close_polls report from machineId
  const expectedReportsByPrecinct: Record<string, unknown[]> = {};
  for (const precinct of sampleElectionDefinition.election.precincts) {
    expectedReportsByPrecinct[precinct.id] = [
      {
        machineId: 'machineId',
        pollsTransitionType: 'close_polls',
        precinctIds: [],
        signedTimestamp: new Date('2024-01-02T12:00:00.000Z'),
      },
    ];
  }
  expect(pollsStatus).toEqual(
    ok({
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      ballotHash: sampleElectionDefinition.ballotHash,
      isLive: true,
      reportsByPrecinct: expectedReportsByPrecinct,
    })
  );

  // Report from a different machine should be added to the list of machines reporting
  const result4 = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr3//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'machineId-2',
      timestamp: new Date('2024-01-02T12:00:00Z').getTime() / 1000,
      isLiveMode: true,
      primaryMessage: encodedTally2,
      encodedPrecinctBitmap: allPrecinctsBitmap2,
      numPages: 1,
      pageIndex: 0,
      ballotCount: 0,
      votingType: 'election_day',
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(result4).toEqual(ok(expect.anything()));
  const storedResults3 = await apiClient.getLiveResultsReports({
    electionId: sampleElectionDefinition.election.id,
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
      isLive: true,
    })
  );
});

test('quick results reporting works for polls open reporting', async () => {
  const {
    unauthenticatedApiClient,
    apiClient,
    workspace,
    fileStorageClient,
    auth0,
  } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);
  const sampleElectionDefinition = await setUpElectionInSystem(
    apiClient,
    workspace,
    fileStorageClient
  );
  // stay logged in for getting polls status
  const precinctId = sampleElectionDefinition.election.precincts[0].id;

  const openResult = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr3//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'mock-01',
      timestamp: new Date('2024-05-04T08:00:00Z').getTime() / 1000,
      isLiveMode: false,
      encodedPrecinctBitmap: '',
      primaryMessage: 'open_polls',
      numPages: 1,
      pageIndex: 0,
      ballotCount: 0,
      votingType: 'election_day',
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });

  expect(openResult).toEqual(
    ok(
      expect.objectContaining({
        ballotHash: sampleElectionDefinition.ballotHash,
        pollsTransitionType: 'open_polls',
        machineId: 'mock-01',
        isLive: false,
        pollsTransitionTime: new Date('2024-05-04T08:00:00Z'),
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        precinctIds: [],
        isPartial: false,
      })
    )
  );

  const openResultForPrecinct =
    await unauthenticatedApiClient.processQrCodeReport({
      payload: `1//qr3//${encodeQuickResultsMessage({
        ballotHash: sampleElectionDefinition.ballotHash,
        signingMachineId: 'mock-02',
        timestamp: new Date('2024-05-04T09:00:00Z').getTime() / 1000,
        isLiveMode: false,
        encodedPrecinctBitmap: '',
        primaryMessage: 'open_polls',
        numPages: 1,
        pageIndex: 0,
        ballotCount: 0,
        votingType: 'election_day',
      })}`,
      signature: 'test-signature',
      certificate: 'test-certificate',
    });

  expect(openResultForPrecinct).toEqual(
    ok(
      expect.objectContaining({
        ballotHash: sampleElectionDefinition.ballotHash,
        pollsTransitionType: 'open_polls',
        machineId: 'mock-02',
        isLive: false,
        pollsTransitionTime: new Date('2024-05-04T09:00:00Z'),
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        precinctIds: [],
      })
    )
  );

  const otherPrecinctId = sampleElectionDefinition.election.precincts[1].id;
  const pollsStatus = await apiClient.getLiveReportsSummary({
    electionId: sampleElectionDefinition.election.id,
  });
  expect(pollsStatus).toEqual(
    ok({
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      ballotHash: sampleElectionDefinition.ballotHash,
      isLive: false,
      reportsByPrecinct: expect.objectContaining({
        [ALL_PRECINCTS_REPORT_KEY]: expect.arrayContaining([
          {
            machineId: 'mock-01',
            pollsTransitionType: 'open_polls',
            precinctIds: [],
            signedTimestamp: new Date('2024-05-04T08:00:00Z'),
          },
          {
            machineId: 'mock-02',
            pollsTransitionType: 'open_polls',
            precinctIds: [],
            signedTimestamp: new Date('2024-05-04T09:00:00Z'),
          },
        ]),
        // No reports for the other precincts, check one as an example
        [otherPrecinctId]: [],
      }),
    })
  );

  const mockResults = buildElectionResultsFixture({
    election: sampleElectionDefinition.election,
    cardCounts: {
      bmd: [],
      hmpb: [],
    },
    contestResultsSummaries: {},
    includeGenericWriteIn: true,
  });
  const closeResultsByPrecinct = buildResultsByPrecinct(
    sampleElectionDefinition.election,
    mockResults,
    ALL_PRECINCTS_SELECTION
  );
  const { tallyEntries: encodedTally, bitmap: closeBitmap } =
    encodeQr3TallyComponents(
      sampleElectionDefinition.election,
      closeResultsByPrecinct
    );

  const result = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr3//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'mock-01',
      timestamp: new Date('2024-05-04T12:00:00Z').getTime() / 1000, // this time is more recent then the polls open
      isLiveMode: false,
      encodedPrecinctBitmap: closeBitmap,
      primaryMessage: encodedTally,
      numPages: 1,
      pageIndex: 0,
      ballotCount: 0,
      votingType: 'election_day',
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(result).toEqual(
    ok(
      expect.objectContaining({
        ballotHash: sampleElectionDefinition.ballotHash,
        pollsTransitionType: 'close_polls',
        machineId: 'mock-01',
        isLive: false,
        pollsTransitionTime: new Date('2024-05-04T12:00:00Z'),
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        precinctIds: [],
        contestResultsByPrecinct: { '__all': mockResults.contestResults },
      })
    )
  );

  const pollsStatusUpdated = await apiClient.getLiveReportsSummary({
    electionId: sampleElectionDefinition.election.id,
  });
  // mock-01 close_polls is stored per-precinct; mock-02 open_polls stored with precinctId: ''
  expect(pollsStatusUpdated).toEqual(
    ok(
      expect.objectContaining({
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        isLive: false,
        ballotHash: sampleElectionDefinition.ballotHash,
        reportsByPrecinct: expect.objectContaining({
          [ALL_PRECINCTS_REPORT_KEY]: expect.arrayContaining([
            {
              machineId: 'mock-02',
              pollsTransitionType: 'open_polls',
              precinctIds: [],
              signedTimestamp: new Date('2024-05-04T09:00:00Z'),
            },
          ]),
          [precinctId]: expect.arrayContaining([
            expect.objectContaining({
              machineId: 'mock-01',
              pollsTransitionType: 'close_polls',
              signedTimestamp: new Date('2024-05-04T12:00:00Z'),
            }),
          ]),
        }),
      })
    )
  );

  // Simulate polls open on election day in live mode
  const openResultLiveMode = await unauthenticatedApiClient.processQrCodeReport(
    {
      payload: `1//qr3//${encodeQuickResultsMessage({
        ballotHash: sampleElectionDefinition.ballotHash,
        signingMachineId: 'mock-01',
        timestamp: new Date('2024-05-05T08:00:00Z').getTime() / 1000,
        isLiveMode: true,
        encodedPrecinctBitmap: '',
        primaryMessage: 'open_polls',
        numPages: 1,
        pageIndex: 0,
        ballotCount: 0,
        votingType: 'election_day',
      })}`,
      signature: 'test-signature',
      certificate: 'test-certificate',
    }
  );

  expect(openResultLiveMode).toEqual(
    ok({
      ballotHash: sampleElectionDefinition.ballotHash,
      pollsTransitionType: 'open_polls',
      machineId: 'mock-01',
      isLive: true,
      pollsTransitionTime: new Date('2024-05-05T08:00:00Z'),
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      precinctIds: [],
      isPartial: false,
      ballotCount: 0,
      votingType: 'election_day',
    })
  );

  // Once live data is reported only live poll status data is returned
  const pollsStatusLiveMode = await apiClient.getLiveReportsSummary({
    electionId: sampleElectionDefinition.election.id,
  });

  expect(pollsStatusLiveMode).toEqual(
    ok({
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      isLive: true,
      ballotHash: sampleElectionDefinition.ballotHash,
      reportsByPrecinct: expect.objectContaining({
        [ALL_PRECINCTS_REPORT_KEY]: [
          {
            machineId: 'mock-01',
            pollsTransitionType: 'open_polls',
            precinctIds: [],
            signedTimestamp: new Date('2024-05-05T08:00:00Z'),
          },
        ],
        // No reports for the other precincts, check one as an example
        [otherPrecinctId]: [],
      }),
    })
  );
});

test('quick results reporting works for polls paused reporting', async () => {
  const {
    unauthenticatedApiClient,
    apiClient,
    workspace,
    fileStorageClient,
    auth0,
  } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);
  const sampleElectionDefinition = await setUpElectionInSystem(
    apiClient,
    workspace,
    fileStorageClient
  );
  const precinctId = sampleElectionDefinition.election.precincts[0].id;

  const pausedResult = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr3//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'mock-01',
      timestamp: new Date('2024-05-04T10:00:00Z').getTime() / 1000,
      isLiveMode: false,
      encodedPrecinctBitmap: '',
      primaryMessage: 'pause_voting',
      numPages: 1,
      pageIndex: 0,
      ballotCount: 0,
      votingType: 'election_day',
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });

  expect(pausedResult).toEqual(
    ok(
      expect.objectContaining({
        ballotHash: sampleElectionDefinition.ballotHash,
        pollsTransitionType: 'pause_voting',
        machineId: 'mock-01',
        isLive: false,
        pollsTransitionTime: new Date('2024-05-04T10:00:00Z'),
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        precinctIds: [],
        isPartial: false,
      })
    )
  );

  const pollsStatus = await apiClient.getLiveReportsSummary({
    electionId: sampleElectionDefinition.election.id,
  });
  expect(pollsStatus).toEqual(
    ok(
      expect.objectContaining({
        reportsByPrecinct: expect.objectContaining({
          [ALL_PRECINCTS_REPORT_KEY]: [
            {
              machineId: 'mock-01',
              pollsTransitionType: 'pause_voting',
              precinctIds: [],
              signedTimestamp: new Date('2024-05-04T10:00:00Z'),
            },
          ],
        }),
      })
    )
  );
});

test('quick results reporting works for voting resumed reporting', async () => {
  const {
    unauthenticatedApiClient,
    apiClient,
    workspace,
    fileStorageClient,
    auth0,
  } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);
  const sampleElectionDefinition = await setUpElectionInSystem(
    apiClient,
    workspace,
    fileStorageClient
  );
  const precinctId = sampleElectionDefinition.election.precincts[0].id;

  const resumedResult = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr3//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'mock-01',
      timestamp: new Date('2024-05-04T11:00:00Z').getTime() / 1000,
      isLiveMode: false,
      encodedPrecinctBitmap: '',
      primaryMessage: 'resume_voting',
      numPages: 1,
      pageIndex: 0,
      ballotCount: 50,
      votingType: 'election_day',
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });

  expect(resumedResult).toEqual(
    ok(
      expect.objectContaining({
        ballotHash: sampleElectionDefinition.ballotHash,
        pollsTransitionType: 'resume_voting',
        machineId: 'mock-01',
        isLive: false,
        pollsTransitionTime: new Date('2024-05-04T11:00:00Z'),
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        precinctIds: [],
        isPartial: false,
        ballotCount: 50,
      })
    )
  );

  const pollsStatus = await apiClient.getLiveReportsSummary({
    electionId: sampleElectionDefinition.election.id,
  });
  expect(pollsStatus).toEqual(
    ok(
      expect.objectContaining({
        reportsByPrecinct: expect.objectContaining({
          [ALL_PRECINCTS_REPORT_KEY]: [
            {
              machineId: 'mock-01',
              pollsTransitionType: 'resume_voting',
              precinctIds: [],
              signedTimestamp: new Date('2024-05-04T11:00:00Z'),
            },
          ],
        }),
      })
    )
  );
});

test('processQrCodeReport handles v1 (qr1) message format without ballotCount', async () => {
  const {
    unauthenticatedApiClient,
    apiClient,
    workspace,
    fileStorageClient,
    auth0,
  } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);
  const sampleElectionDefinition = await setUpElectionInSystem(
    apiClient,
    workspace,
    fileStorageClient
  );
  auth0.logOut();

  const timestamp = new Date('2024-05-04T08:00:00Z').getTime() / 1000;
  // Construct a v1 (qr1) payload manually with 8 null-byte-separated fields (no ballotCount)
  const v1MessageParts = [
    encodeURIComponent(sampleElectionDefinition.ballotHash),
    encodeURIComponent('mock-v1'),
    '0', // test mode
    timestamp.toString(),
    'polls_open',
    '', // all precincts
    '1',
    '0',
  ];
  // Null byte separator used in the QR message format
  const v1Payload = `1//qr1//${v1MessageParts.join('\x00')}`;

  const result = await unauthenticatedApiClient.processQrCodeReport({
    payload: v1Payload,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });

  expect(result).toEqual(
    ok({
      ballotHash: sampleElectionDefinition.ballotHash,
      pollsTransitionType: 'open_polls',
      machineId: 'mock-v1',
      isLive: false,
      reportCreatedAt: new Date('2024-05-04T08:00:00Z'),
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      precinctSelection: ALL_PRECINCTS_SELECTION,
      isPartial: false,
      ballotCount: undefined,
      votingType: 'election_day',
    })
  );

  // Also test v1 with tally data (polls_closed_final)
  const mockResults = buildElectionResultsFixture({
    election: sampleElectionDefinition.election,
    cardCounts: {
      bmd: [],
      hmpb: [],
    },
    contestResultsSummaries: {},
    includeGenericWriteIn: true,
  });
  const encodedTally = encodeCompressedTally(
    compressTally(
      sampleElectionDefinition.election,
      mockResults,
      ALL_PRECINCTS_SELECTION
    ),
    1
  )[0];

  const v1TallyParts = [
    encodeURIComponent(sampleElectionDefinition.ballotHash),
    encodeURIComponent('mock-v1'),
    '0',
    timestamp.toString(),
    encodedTally,
    '', // all precincts
    '1',
    '0',
  ];
  // Null byte separator used in the QR message format
  const v1TallyPayload = `1//qr1//${v1TallyParts.join('\x00')}`;

  const tallyResult = await unauthenticatedApiClient.processQrCodeReport({
    payload: v1TallyPayload,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });

  expect(tallyResult).toEqual(
    ok(
      expect.objectContaining({
        ballotHash: sampleElectionDefinition.ballotHash,
        pollsTransitionType: 'close_polls',
        machineId: 'mock-v1',
        isLive: false,
        isPartial: false,
      })
    )
  );
});

test('quick results reporting works as expected end to end with single precinct reports', async () => {
  const {
    unauthenticatedApiClient,
    apiClient,
    workspace,
    fileStorageClient,
    auth0,
  } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
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
      bmd: [],
      hmpb: [],
    },
    contestResultsSummaries: sampleContestResults,
    includeGenericWriteIn: true,
  });

  // Create mock results for second precinct
  const mockResultsSecondPrecinct = buildElectionResultsFixture({
    election: sampleElectionDefinition.election,
    cardCounts: {
      bmd: [],
      hmpb: [],
    },
    contestResultsSummaries: sampleContestResults,
    includeGenericWriteIn: true,
  });

  // Report data from first precinct
  const firstPrecinctResultsByPrecinct = buildResultsByPrecinct(
    sampleElectionDefinition.election,
    mockResultsFirstPrecinct,
    singlePrecinctSelectionFor(firstPrecinctId)
  );
  const {
    tallyEntries: encodedTallyFirstPrecinct,
    bitmap: firstPrecinctBitmap,
  } = encodeQr3TallyComponents(
    sampleElectionDefinition.election,
    firstPrecinctResultsByPrecinct
  );

  const resultFirstPrecinct =
    await unauthenticatedApiClient.processQrCodeReport({
      payload: `1//qr3//${encodeQuickResultsMessage({
        ballotHash: sampleElectionDefinition.ballotHash,
        signingMachineId: 'first-precinct-machine',
        timestamp: new Date('2024-01-01T12:00:00Z').getTime() / 1000,
        isLiveMode: true,
        encodedPrecinctBitmap: firstPrecinctBitmap,
        primaryMessage: encodedTallyFirstPrecinct,
        numPages: 1,
        pageIndex: 0,
        ballotCount: 0,
        votingType: 'election_day',
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
        pollsTransitionTime: new Date('2024-01-01T12:00:00Z'),
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        precinctSelection: ALL_PRECINCTS_SELECTION,
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
  const secondPrecinctResultsByPrecinct = buildResultsByPrecinct(
    sampleElectionDefinition.election,
    mockResultsSecondPrecinct,
    singlePrecinctSelectionFor(secondPrecinctId)
  );
  const {
    tallyEntries: encodedTallySecondPrecinct,
    bitmap: secondPrecinctBitmap,
  } = encodeQr3TallyComponents(
    sampleElectionDefinition.election,
    secondPrecinctResultsByPrecinct
  );

  const resultSecondPrecinct =
    await unauthenticatedApiClient.processQrCodeReport({
      payload: `1//qr3//${encodeQuickResultsMessage({
        ballotHash: sampleElectionDefinition.ballotHash,
        signingMachineId: 'second-precinct-machine',
        timestamp: new Date('2024-01-01T13:00:00Z').getTime() / 1000,
        isLiveMode: true,
        encodedPrecinctBitmap: secondPrecinctBitmap,
        primaryMessage: encodedTallySecondPrecinct,
        numPages: 1,
        pageIndex: 0,
        ballotCount: 0,
        votingType: 'election_day',
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
        pollsTransitionTime: new Date('2024-01-01T13:00:00Z'),
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        precinctSelection: ALL_PRECINCTS_SELECTION,
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
  const storedResultsFirstPrecinct = await apiClient.getLiveResultsReports({
    electionId: sampleElectionDefinition.election.id,
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
        isLive: true,
      })
    )
  );
  const contestResultsFirstPrecinct =
    storedResultsFirstPrecinct.ok()?.contestResults;
  expect(Object.keys(assertDefined(contestResultsFirstPrecinct))).toEqual(
    expectedPrecinct1Contests.map((c) => c.id)
  );

  // Verify getting results for second precinct individually
  const storedResultsSecondPrecinct = await apiClient.getLiveResultsReports({
    electionId: sampleElectionDefinition.election.id,
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
        isLive: true,
      })
    )
  );
  const contestResultsSecondPrecinct =
    storedResultsSecondPrecinct.ok()?.contestResults;
  expect(Object.keys(assertDefined(contestResultsSecondPrecinct))).toEqual(
    expectedPrecinct2Contests.map((c) => c.id)
  );

  // Verify getting results for all precincts aggregates the single-precinct reports correctly
  const storedResultsAllPrecincts = await apiClient.getLiveResultsReports({
    electionId: sampleElectionDefinition.election.id,
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
        isLive: true,
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
    const storedResultsThirdPrecinct = await apiClient.getLiveResultsReports({
      electionId: sampleElectionDefinition.election.id,
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
          isLive: true,
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
      bmd: [],
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

  const allPrecinctsResultsByPrecinct = buildResultsByPrecinct(
    sampleElectionDefinition.election,
    mockResultsAllPrecincts,
    ALL_PRECINCTS_SELECTION
  );
  const {
    tallyEntries: encodedTallyAllPrecincts,
    bitmap: allPrecinctsBitmapForReport,
  } = encodeQr3TallyComponents(
    sampleElectionDefinition.election,
    allPrecinctsResultsByPrecinct
  );

  const resultAllPrecincts = await unauthenticatedApiClient.processQrCodeReport(
    {
      payload: `1//qr3//${encodeQuickResultsMessage({
        ballotHash: sampleElectionDefinition.ballotHash,
        signingMachineId: 'allprecincts-machine',
        timestamp: new Date('2024-01-01T14:00:00Z').getTime() / 1000,
        isLiveMode: true,
        encodedPrecinctBitmap: allPrecinctsBitmapForReport,
        primaryMessage: encodedTallyAllPrecincts,
        numPages: 1,
        pageIndex: 0,
        ballotCount: 0,
        votingType: 'election_day',
      })}`,
      signature: 'test-signature',
      certificate: 'test-certificate',
    }
  );

  expect(resultAllPrecincts).toEqual(ok(expect.anything()));

  // After all-precincts report, individual precinct results should still be available
  const finalStoredResultsFirstPrecinct = await apiClient.getLiveResultsReports(
    {
      electionId: sampleElectionDefinition.election.id,
      precinctSelection: singlePrecinctSelectionFor(firstPrecinctId),
    }
  );
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
        isLive: true,
      })
    )
  );

  // All precincts results should now show the all-precincts report data
  const finalStoredResultsAllPrecincts = await apiClient.getLiveResultsReports({
    electionId: sampleElectionDefinition.election.id,
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
        isLive: true,
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
  } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
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
      bmd: [],
      hmpb: [],
    },
    contestResultsSummaries: sampleContestResults,
    includeGenericWriteIn: true,
  });
  const deleteTestResultsByPrecinct = buildResultsByPrecinct(
    sampleElectionDefinition.election,
    mockResults,
    ALL_PRECINCTS_SELECTION
  );
  const { tallyEntries: encodedTally, bitmap: deleteTestBitmap } =
    encodeQr3TallyComponents(
      sampleElectionDefinition.election,
      deleteTestResultsByPrecinct
    );

  // Submit test results (isLiveMode: false)
  const testResult = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr3//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'test-machine-test',
      timestamp: new Date('2024-01-01T13:00:00Z').getTime() / 1000,
      isLiveMode: false,
      encodedPrecinctBitmap: deleteTestBitmap,
      primaryMessage: encodedTally,
      numPages: 1,
      pageIndex: 0,
      ballotCount: 0,
      votingType: 'election_day',
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(testResult).toEqual(ok(expect.anything()));

  auth0.setLoggedInUser(nonVxUser);

  const storedTestResults = await apiClient.getLiveResultsReports({
    electionId: sampleElectionDefinition.election.id,
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
      isLive: false,
    })
  );

  // Submit live results
  const liveResult = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr3//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'test-machine-live',
      timestamp: new Date('2024-01-01T12:00:00Z').getTime() / 1000,
      isLiveMode: true,
      encodedPrecinctBitmap: deleteTestBitmap,
      primaryMessage: encodedTally,
      numPages: 1,
      pageIndex: 0,
      ballotCount: 0,
      votingType: 'election_day',
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(liveResult).toEqual(ok(expect.anything()));

  // Verify both live and test results exist before clearing
  const storedLiveResults = await apiClient.getLiveResultsReports({
    electionId: sampleElectionDefinition.election.id,
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
      isLive: true,
    })
  );

  // Clear results
  await apiClient.deleteQuickReportingResults({
    electionId: sampleElectionDefinition.election.id,
  });

  const clearedResults = await apiClient.getLiveResultsReports({
    electionId: sampleElectionDefinition.election.id,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });

  expect(clearedResults).toEqual(ok(expect.anything()));
  expect(clearedResults.ok()?.machinesReporting).toEqual([]);
  // When cleared, contest results should exist but have zero values
  const liveContestResults = clearedResults.ok()?.contestResults;
  expect(liveContestResults).toBeDefined();
  for (const contestResult of Object.values(liveContestResults!)) {
    expect(contestResult.ballots).toEqual(0);
    expect(contestResult.overvotes).toEqual(0);
    expect(contestResult.undervotes).toEqual(0);
  }
});

test('quick results reporting supports paginated 2-page reports', async () => {
  const {
    unauthenticatedApiClient,
    apiClient,
    workspace,
    fileStorageClient,
    auth0,
  } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);
  const sampleElectionDefinition = await setUpElectionInSystem(
    apiClient,
    workspace,
    fileStorageClient
  );
  auth0.logOut();
  const { contests } = sampleElectionDefinition.election;
  const contestId1 = contests[0].id;
  const contestIdLast = contests[contests.length - 1].id;

  // Build simple results and split into two sections
  const mockResults = buildElectionResultsFixture({
    election: sampleElectionDefinition.election,
    cardCounts: { bmd: [], hmpb: [] },
    contestResultsSummaries: {
      [contestId1]: {
        type: 'candidate',
        ballots: 100,
        undervotes: 10,
        overvotes: 5,
        officialOptionTallies: {},
      },
      [contestIdLast]: {
        type: 'yesno',
        ballots: 200,
        undervotes: 20,
        overvotes: 10,
        yesTally: 150,
        noTally: 40,
      },
    },
    includeGenericWriteIn: true,
  });

  const paginatedResultsByPrecinct = buildResultsByPrecinct(
    sampleElectionDefinition.election,
    mockResults,
    ALL_PRECINCTS_SELECTION
  );
  const sections = encodeTallyEntries({
    election: sampleElectionDefinition.election,
    resultsByPrecinct: paginatedResultsByPrecinct,
    numPages: 2,
  });
  const paginatedBitmap = encodePrecinctBitmap(
    sampleElectionDefinition.election,
    paginatedResultsByPrecinct
  );

  // Sanity: should produce 2 sections
  expect(sections.length).toEqual(2);

  // Send page 1 (index 0) only
  const payloadPage1 = `1//qr3//${encodeQuickResultsMessage({
    ballotHash: sampleElectionDefinition.ballotHash,
    signingMachineId: 'paginated-machine',
    timestamp: new Date('2024-01-01T12:00:00Z').getTime() / 1000,
    isLiveMode: true,
    encodedPrecinctBitmap: paginatedBitmap,
    primaryMessage: sections[0],
    numPages: 2,
    pageIndex: 0,
    ballotCount: 0,
    votingType: 'election_day',
  })}`;

  const r1 = await unauthenticatedApiClient.processQrCodeReport({
    payload: payloadPage1,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  // Should accept page, but not return assembled contestResults yet
  expect(r1).toEqual(
    ok({
      ballotHash: sampleElectionDefinition.ballotHash,
      machineId: 'paginated-machine',
      precinctSelection: ALL_PRECINCTS_SELECTION,
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      numPages: 2,
      pageIndex: 0,
      pollsTransitionType: 'close_polls',
      isLive: true,
      pollsTransitionTime: new Date('2024-01-01T12:00:00Z'),
      isPartial: true,
      votingType: 'election_day',
    })
  );

  // Query stored results -> should not have machines reporting assembled data yet
  auth0.setLoggedInUser(nonVxUser);
  const storedAfterPage1 = await apiClient.getLiveResultsReports({
    electionId: sampleElectionDefinition.election.id,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  // No assembled contestResults should be present for this machine yet
  expect(storedAfterPage1).toEqual(
    ok(
      expect.objectContaining({
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        ballotHash: sampleElectionDefinition.ballotHash,
        machinesReporting: [],
      })
    )
  );

  // Send page 2 (index 1)
  const payloadPage2 = `1//qr3//${encodeQuickResultsMessage({
    ballotHash: sampleElectionDefinition.ballotHash,
    signingMachineId: 'paginated-machine',
    timestamp: new Date('2024-01-01T12:00:01Z').getTime() / 1000,
    isLiveMode: true,
    encodedPrecinctBitmap: paginatedBitmap,
    primaryMessage: sections[1],
    numPages: 2,
    pageIndex: 1,
    ballotCount: 0,
    votingType: 'election_day',
  })}`;

  auth0.logOut();
  const r2 = await unauthenticatedApiClient.processQrCodeReport({
    payload: payloadPage2,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(r2).toEqual(
    ok({
      ballotHash: sampleElectionDefinition.ballotHash,
      machineId: 'paginated-machine',
      precinctSelection: ALL_PRECINCTS_SELECTION,
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      pollsTransitionType: 'close_polls',
      isLive: true,
      pollsTransitionTime: new Date('2024-01-01T12:00:01Z'),
      contestResults: mockResults.contestResults,
      isPartial: false,
      votingType: 'election_day',
    })
  );

  // Now the assembled result should be available
  auth0.setLoggedInUser(nonVxUser);
  const storedAfterPage2 = await apiClient.getLiveResultsReports({
    electionId: sampleElectionDefinition.election.id,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });

  expect(storedAfterPage2).toEqual(
    ok(
      expect.objectContaining({
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        ballotHash: sampleElectionDefinition.ballotHash,
        machinesReporting: expect.arrayContaining(['paginated-machine']),
        isLive: true,
        contestResults: mockResults.contestResults,
      })
    )
  );
});

test('quick results reporting clears previous partial reports on numPages change', async () => {
  const {
    unauthenticatedApiClient,
    apiClient,
    workspace,
    fileStorageClient,
    auth0,
  } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);
  const sampleElectionDefinition = await setUpElectionInSystem(
    apiClient,
    workspace,
    fileStorageClient
  );
  auth0.logOut();
  const { contests } = sampleElectionDefinition.election;
  const contestId1 = contests[0].id;
  const contestIdLast = contests[contests.length - 1].id;

  // Build simple results and split into two sections
  const mockResults = buildElectionResultsFixture({
    election: sampleElectionDefinition.election,
    cardCounts: { bmd: [], hmpb: [] },
    contestResultsSummaries: {
      [contestId1]: {
        type: 'candidate',
        ballots: 100,
        undervotes: 10,
        overvotes: 5,
        officialOptionTallies: {},
      },
      [contestIdLast]: {
        type: 'yesno',
        ballots: 200,
        undervotes: 20,
        overvotes: 10,
        yesTally: 150,
        noTally: 40,
      },
    },
    includeGenericWriteIn: true,
  });

  const numPagesResultsByPrecinct = buildResultsByPrecinct(
    sampleElectionDefinition.election,
    mockResults,
    ALL_PRECINCTS_SELECTION
  );
  const sections = encodeTallyEntries({
    election: sampleElectionDefinition.election,
    resultsByPrecinct: numPagesResultsByPrecinct,
    numPages: 2,
  });
  const numPagesBitmap = encodePrecinctBitmap(
    sampleElectionDefinition.election,
    numPagesResultsByPrecinct
  );

  // Sanity: should produce 2 sections
  expect(sections.length).toEqual(2);

  // Send page 1 (index 0) only
  const payloadPage1 = `1//qr3//${encodeQuickResultsMessage({
    ballotHash: sampleElectionDefinition.ballotHash,
    signingMachineId: 'paginated-machine',
    timestamp: new Date('2024-01-01T12:00:00Z').getTime() / 1000,
    isLiveMode: true,
    encodedPrecinctBitmap: numPagesBitmap,
    primaryMessage: sections[0],
    numPages: 2,
    pageIndex: 0,
    ballotCount: 0,
    votingType: 'election_day',
  })}`;

  const r1 = await unauthenticatedApiClient.processQrCodeReport({
    payload: payloadPage1,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  // Should accept page, but not return assembled contestResults yet
  expect(r1).toEqual(
    ok({
      ballotHash: sampleElectionDefinition.ballotHash,
      machineId: 'paginated-machine',
      precinctSelection: ALL_PRECINCTS_SELECTION,
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      numPages: 2,
      pageIndex: 0,
      pollsTransitionType: 'close_polls',
      isLive: true,
      pollsTransitionTime: new Date('2024-01-01T12:00:00Z'),
      isPartial: true,
      votingType: 'election_day',
    })
  );

  // Create a new url now with 3 pages
  const sectionsInThreePages = encodeTallyEntries({
    election: sampleElectionDefinition.election,
    resultsByPrecinct: numPagesResultsByPrecinct,
    numPages: 3,
  });

  // Send page 2 (of now 3) - this should clear the previous partial report and NOT send results (like p2/2 would)
  const payloadPage2 = `1//qr3//${encodeQuickResultsMessage({
    ballotHash: sampleElectionDefinition.ballotHash,
    signingMachineId: 'paginated-machine',
    timestamp: new Date('2024-01-01T12:00:01Z').getTime() / 1000,
    isLiveMode: true,
    encodedPrecinctBitmap: numPagesBitmap,
    primaryMessage: sectionsInThreePages[1],
    numPages: 3,
    pageIndex: 1,
    ballotCount: 0,
    votingType: 'election_day',
  })}`;

  const r2 = await unauthenticatedApiClient.processQrCodeReport({
    payload: payloadPage2,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  // Should accept page, but not return assembled contestResults yet
  expect(r2).toEqual(
    ok({
      ballotHash: sampleElectionDefinition.ballotHash,
      machineId: 'paginated-machine',
      precinctSelection: ALL_PRECINCTS_SELECTION,
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      numPages: 3,
      pageIndex: 1,
      pollsTransitionType: 'close_polls',
      isLive: true,
      pollsTransitionTime: new Date('2024-01-01T12:00:01Z'),
      isPartial: true,
      votingType: 'election_day',
    })
  );

  // Now send page 3 (of 3)
  const payloadPage3 = `1//qr3//${encodeQuickResultsMessage({
    ballotHash: sampleElectionDefinition.ballotHash,
    signingMachineId: 'paginated-machine',
    timestamp: new Date('2024-01-01T12:00:02Z').getTime() / 1000,
    isLiveMode: true,
    encodedPrecinctBitmap: numPagesBitmap,
    primaryMessage: sectionsInThreePages[2],
    numPages: 3,
    pageIndex: 2,
    ballotCount: 0,
    votingType: 'election_day',
  })}`;

  const r3 = await unauthenticatedApiClient.processQrCodeReport({
    payload: payloadPage3,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  // We are still missing page 1 of 3, so should not have results yet
  expect(r3).toEqual(
    ok({
      ballotHash: sampleElectionDefinition.ballotHash,
      machineId: 'paginated-machine',
      precinctSelection: ALL_PRECINCTS_SELECTION,
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      numPages: 3,
      pageIndex: 2,
      pollsTransitionType: 'close_polls',
      isLive: true,
      pollsTransitionTime: new Date('2024-01-01T12:00:02Z'),
      isPartial: true,
      votingType: 'election_day',
    })
  );

  const newPayloadPage1 = `1//qr3//${encodeQuickResultsMessage({
    ballotHash: sampleElectionDefinition.ballotHash,
    signingMachineId: 'paginated-machine',
    timestamp: new Date('2024-01-01T12:00:00Z').getTime() / 1000,
    isLiveMode: true,
    encodedPrecinctBitmap: numPagesBitmap,
    primaryMessage: sectionsInThreePages[0],
    numPages: 3,
    pageIndex: 0,
    ballotCount: 0,
    votingType: 'election_day',
  })}`;

  expect(newPayloadPage1).not.toEqual(payloadPage1);
  // Now send page 1 (of 3) again
  const r1again = await unauthenticatedApiClient.processQrCodeReport({
    payload: newPayloadPage1,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  // Now we should have results since all 3 pages have been submitted
  expect(r1again).toEqual(
    ok({
      ballotHash: sampleElectionDefinition.ballotHash,
      machineId: 'paginated-machine',
      precinctSelection: ALL_PRECINCTS_SELECTION,
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      pollsTransitionType: 'close_polls',
      isLive: true,
      pollsTransitionTime: new Date('2024-01-01T12:00:00Z'),
      contestResults: mockResults.contestResults,
      isPartial: false,
      votingType: 'election_day',
    })
  );
});

test('quick results clears previous partial reports when precinctSelection changes', async () => {
  const {
    unauthenticatedApiClient,
    apiClient,
    workspace,
    fileStorageClient,
    auth0,
  } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);
  const sampleElectionDefinition = await setUpElectionInSystem(
    apiClient,
    workspace,
    fileStorageClient
  );
  auth0.logOut();

  const precinctA = sampleElectionDefinition.election.precincts[0].id;
  const precinctB = sampleElectionDefinition.election.precincts[1].id;

  // Build simple results and split into two pages
  const mockResults = buildElectionResultsFixture({
    election: sampleElectionDefinition.election,
    cardCounts: { bmd: [], hmpb: [] },
    contestResultsSummaries: {},
    includeGenericWriteIn: true,
  });

  const precinctAResultsByPrecinct = buildResultsByPrecinct(
    sampleElectionDefinition.election,
    mockResults,
    singlePrecinctSelectionFor(precinctA)
  );
  const sections = encodeTallyEntries({
    election: sampleElectionDefinition.election,
    resultsByPrecinct: precinctAResultsByPrecinct,
    numPages: 2,
  });
  const precinctABitmap = encodePrecinctBitmap(
    sampleElectionDefinition.election,
    precinctAResultsByPrecinct
  );

  // Submit page 1 for precinct A (partial)
  const payloadA1 = `1//qr3//${encodeQuickResultsMessage({
    ballotHash: sampleElectionDefinition.ballotHash,
    signingMachineId: 'machine-x',
    timestamp: new Date('2024-01-01T10:00:00Z').getTime() / 1000,
    isLiveMode: true,
    encodedPrecinctBitmap: precinctABitmap,
    primaryMessage: sections[0],
    numPages: 2,
    pageIndex: 0,
    ballotCount: 0,
    votingType: 'election_day',
  })}`;

  const rA1 = await unauthenticatedApiClient.processQrCodeReport({
    payload: payloadA1,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(rA1).toEqual(
    ok(
      expect.objectContaining({
        isPartial: true,
        votingType: 'election_day',
      })
    )
  );

  // Now submit page 1 for precinct B with same machine (should clear A's partial)
  const precinctBResultsByPrecinct = buildResultsByPrecinct(
    sampleElectionDefinition.election,
    mockResults,
    singlePrecinctSelectionFor(precinctB)
  );
  const sectionsB = encodeTallyEntries({
    election: sampleElectionDefinition.election,
    resultsByPrecinct: precinctBResultsByPrecinct,
    numPages: 2,
  });
  const precinctBBitmap = encodePrecinctBitmap(
    sampleElectionDefinition.election,
    precinctBResultsByPrecinct
  );

  const payloadB1 = `1//qr3//${encodeQuickResultsMessage({
    ballotHash: sampleElectionDefinition.ballotHash,
    signingMachineId: 'machine-x',
    timestamp: new Date('2024-01-01T10:00:01Z').getTime() / 1000,
    isLiveMode: true,
    encodedPrecinctBitmap: precinctBBitmap,
    primaryMessage: sectionsB[0],
    numPages: 2,
    pageIndex: 0,
    ballotCount: 0,
    votingType: 'election_day',
  })}`;

  const rB1 = await unauthenticatedApiClient.processQrCodeReport({
    payload: payloadB1,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(rB1).toEqual(
    ok(
      expect.objectContaining({
        isPartial: true,
        votingType: 'election_day',
      })
    )
  );

  // Now submit page 2 for all precincts selection, should clear B's partial
  const allPrecinctsBitmapForC = encodePrecinctBitmap(
    sampleElectionDefinition.election,
    buildResultsByPrecinct(
      sampleElectionDefinition.election,
      mockResults,
      ALL_PRECINCTS_SELECTION
    )
  );
  const payloadC1 = `1//qr3//${encodeQuickResultsMessage({
    ballotHash: sampleElectionDefinition.ballotHash,
    signingMachineId: 'machine-x',
    timestamp: new Date('2024-01-01T10:00:02Z').getTime() / 1000,
    isLiveMode: true,
    encodedPrecinctBitmap: allPrecinctsBitmapForC,
    primaryMessage: sections[1],
    numPages: 2,
    pageIndex: 1,
    ballotCount: 0,
    votingType: 'election_day',
  })}`;

  const rC1 = await unauthenticatedApiClient.processQrCodeReport({
    payload: payloadC1,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(rC1).toEqual(
    ok(
      expect.objectContaining({
        isPartial: true,
        votingType: 'election_day',
      })
    )
  );

  // Now re-submit page 1 for precinct A again should clear all previous partials
  const rA1Again = await unauthenticatedApiClient.processQrCodeReport({
    payload: payloadA1,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(rA1Again).toEqual(
    ok(
      expect.objectContaining({
        isPartial: true,
        votingType: 'election_day',
      })
    )
  );

  // Submit page 2 for precinct A - should assemble final result
  const payloadA2 = `1//qr3//${encodeQuickResultsMessage({
    ballotHash: sampleElectionDefinition.ballotHash,
    signingMachineId: 'machine-x',
    timestamp: new Date('2024-01-01T10:00:03Z').getTime() / 1000,
    isLiveMode: true,
    encodedPrecinctBitmap: precinctABitmap,
    primaryMessage: sections[1],
    numPages: 2,
    pageIndex: 1,
    ballotCount: 0,
    votingType: 'election_day',
  })}`;

  const rA2 = await unauthenticatedApiClient.processQrCodeReport({
    payload: payloadA2,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(rA2).toEqual(
    ok(
      expect.objectContaining({
        isPartial: false,
        contestResults: expect.anything(),
      })
    )
  );
});

test('LiveReports uses modified exported election, not original vxdesign election', async () => {
  const {
    unauthenticatedApiClient,
    apiClient,
    workspace,
    fileStorageClient,
    auth0,
  } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);

  // Load the base election
  const electionId = (
    await apiClient.loadElection({
      newId: 'reordered-election-id' as ElectionId,
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: JSON.stringify(
          baseElectionDefinition.election,
          null,
          2
        ),
      },
    })
  ).unsafeUnwrap();

  // Get the original contest and candidate order
  const originalFirstContest = baseElectionDefinition.election.contests[0];

  // Create a reordered version of the election (simulating NH ballot template behavior)
  const reorderedElection: typeof baseElectionDefinition.election = {
    ...baseElectionDefinition.election,
    id: 'reordered-election-id' as ElectionId,
    // Reverse both contest order and candidate order in first contest
    contests: [...baseElectionDefinition.election.contests]
      .reverse()
      .map((contest) => {
        if (
          contest.type === 'candidate' &&
          contest.id === originalFirstContest.id
        ) {
          return {
            ...contest,
            candidates: [...contest.candidates].reverse(),
          };
        }
        return contest;
      }),
  };

  // Mock the ballot rendering to return the reordered election
  const reorderedElectionData = JSON.stringify(reorderedElection, null, 2);
  const reorderedElectionDefinition = safeParseElectionDefinition(
    reorderedElectionData
  ).unsafeUnwrap();

  const internalElectionRecord = await workspace.store.getElection(electionId);
  expect(internalElectionRecord.election).not.toEqual(
    reorderedElectionDefinition.election
  );

  vi.mocked(
    renderAllBallotPdfsAndCreateElectionDefinition
  ).mockImplementationOnce(
    // eslint-disable-next-line @typescript-eslint/require-await
    async (_, _ballotTemplates, ballotProps) => ({
      ballotPdfs: ballotProps.map(() => Uint8Array.from('mock-pdf-contents')),
      electionDefinition: reorderedElectionDefinition,
    })
  );

  // Export the election (which will save the reordered version)
  const exportMeta = await exportElectionPackage({
    electionId,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: false,
    shouldExportTestBallots: false,
    numAuditIdBallots: undefined,
    fileStorageClient,
    apiClient,
    workspace,
  });

  const electionPackageContents = getExportedFile({
    storage: fileStorageClient,
    jurisdictionId: nonVxJurisdiction.id,
    url: exportMeta.electionPackageUrl,
  });
  const { electionPackage } = (
    await readElectionPackageFromBuffer(electionPackageContents)
  ).unsafeUnwrap();

  // Process a QR code report with results
  const mockResults = buildElectionResultsFixture({
    election: reorderedElectionDefinition.election,
    cardCounts: {
      bmd: [],
      hmpb: [],
    },
    contestResultsSummaries: {},
    includeGenericWriteIn: true,
  });
  const reorderedResultsByPrecinct = buildResultsByPrecinct(
    reorderedElectionDefinition.election,
    mockResults,
    ALL_PRECINCTS_SELECTION
  );
  const { tallyEntries: encodedTally, bitmap: reorderedBitmap } =
    encodeQr3TallyComponents(
      reorderedElectionDefinition.election,
      reorderedResultsByPrecinct
    );

  auth0.logOut();

  const reportResult = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr3//${encodeQuickResultsMessage({
      ballotHash: electionPackage.electionDefinition.ballotHash,
      signingMachineId: 'test-machine',
      timestamp: new Date('2024-01-01T12:00:00Z').getTime() / 1000,
      isLiveMode: true,
      encodedPrecinctBitmap: reorderedBitmap,
      primaryMessage: encodedTally,
      numPages: 1,
      pageIndex: 0,
      ballotCount: 0,
      votingType: 'election_day',
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });

  // Check the endpoint returned success and references the exported (reordered) election
  expect(reportResult).toEqual(
    ok(
      expect.objectContaining({
        ballotHash: reorderedElectionDefinition.ballotHash,
        isLive: true,
        election: reorderedElectionDefinition.election,
      })
    )
  );

  auth0.setLoggedInUser(nonVxUser);

  const pollStatus = await apiClient.getLiveReportsSummary({ electionId });
  expect(pollStatus).toEqual(
    ok(
      expect.objectContaining({
        ballotHash: reorderedElectionDefinition.ballotHash,
        isLive: true,
        election: reorderedElectionDefinition.election,
      })
    )
  );

  // Get the live reports - should return the EXPORTED (reordered) election
  const liveReports = await apiClient.getLiveResultsReports({
    electionId,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });

  expect(liveReports).toEqual(
    ok(
      expect.objectContaining({
        ballotHash: reorderedElectionDefinition.ballotHash,
        isLive: true,
        election: reorderedElectionDefinition.election,
      })
    )
  );
});
