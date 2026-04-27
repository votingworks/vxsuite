import { afterAll, beforeEach, expect, test, vi } from 'vitest';
import {
  ALL_PRECINCTS_SELECTION,
  buildElectionResultsFixture,
  compressAndEncodePerPrecinctTally,
  ContestResultsSummary,
  ContestResultsSummaries,
  encodeV0CompressedTally,
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
  PollingPlace,
  PollingPlaceType,
  PrecinctId,
  safeParseElectionDefinition,
  Tabulation,
} from '@votingworks/types';
import { encodeQuickResultsMessage } from '@votingworks/auth';
import { electionWithMsEitherNeitherFixtures } from '@votingworks/fixtures';
import { readElectionPackageFromBuffer } from '@votingworks/backend';
import { renderAllBallotPdfsAndCreateElectionDefinition } from '@votingworks/hmpb';
import type * as grout from '@votingworks/grout';
import type { UnauthenticatedApi } from './app';
import {
  ApiClient,
  exportElectionPackage,
  getExportedFile,
  MockFileStorageClient,
  testSetupHelpers,
} from '../test/helpers';
import { Workspace } from './workspace';
import {
  jurisdictions,
  nonVxJurisdiction,
  nonVxUser,
  organizations,
  users,
} from '../test/mocks';
import { MAX_LIVE_REPORT_ACTIVITY_ITEMS } from './globals';

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

function filterContestResultsForPrecinct(
  contestResults: Record<ContestId, Tabulation.ContestResults>,
  election: ElectionDefinition['election'],
  precinctId: PrecinctId
): Record<ContestId, Tabulation.ContestResults> {
  const precinctContestIds = new Set(
    getContestsForPrecinctAndElection(
      election,
      singlePrecinctSelectionFor(precinctId)
    ).map((c) => c.id)
  );
  const filtered: Record<ContestId, Tabulation.ContestResults> = {};
  for (const [contestId, results] of Object.entries(contestResults)) {
    if (precinctContestIds.has(contestId)) {
      filtered[contestId] = results;
    }
  }
  return filtered;
}

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
    precinctSelection: ALL_PRECINCTS_SELECTION,
    electionId,
  });
  expect(storedResults).toEqual(err('no-election-export-found'));

  const storedPollStatus = await apiClient.getLiveReportsSummary({
    electionId,
  });
  expect(storedPollStatus).toEqual(err('no-election-export-found'));

  const storedActivityLog = await apiClient.getLiveReportsActivityLog({
    electionId,
  });
  expect(storedActivityLog).toEqual(err('no-election-export-found'));

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
      primaryMessage: 'notbase64encoded',
      numPages: 1,
      pageIndex: 0,
      pollingPlaceId: 'test-polling-place',
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
  const encodedTally = encodeV0CompressedTally(mockCompressedTally, 1)[0];

  mockAuthReturnValue = err('invalid-signature');

  const result = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr3//${encodeQuickResultsMessage({
      ballotHash: 'ballotHash',
      signingMachineId: 'machineId',
      timestamp: -1,
      isLiveMode: false,
      primaryMessage: encodedTally,
      numPages: 1,
      pageIndex: 0,
      pollingPlaceId: 'test-polling-place',
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
  const encodedTally = encodeV0CompressedTally(mockCompressedTally, 1)[0];

  const result = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr3//${encodeQuickResultsMessage({
      ballotHash: 'ballotHash',
      signingMachineId: 'machineId',
      timestamp: -1,
      isLiveMode: false,
      primaryMessage: encodedTally,
      numPages: 1,
      pageIndex: 0,
      pollingPlaceId: 'test-polling-place',
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
  const submittedPrecinctId = sampleElectionDefinition.election.precincts[0].id;
  const encodedTally = compressAndEncodePerPrecinctTally({
    election: sampleElectionDefinition.election,
    resultsByPrecinct: { [submittedPrecinctId]: mockResults },
    numPages: 1,
  })[0];

  const result = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr3//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'machineId',
      timestamp: new Date('2024-01-01T12:00:00Z').getTime() / 1000,
      isLiveMode: true,
      primaryMessage: encodedTally,
      numPages: 1,
      pageIndex: 0,
      pollingPlaceId: 'test-polling-place',
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
        pollingPlaceId: 'test-polling-place',
        pollsTransitionType: 'close_polls',
        machineId: 'machineId',
        isLive: true,
        pollsTransitionTime: new Date('2024-01-01T12:00:00Z'),
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        contestResultsByPrecinct: expect.objectContaining({
          [submittedPrecinctId]: filterContestResultsForPrecinct(
            mockResults.contestResults,
            sampleElectionDefinition.election,
            submittedPrecinctId
          ),
        }),
      })
    )
  );

  auth0.setLoggedInUser(nonVxUser);
  // Test that the results were actually stored in the database
  const storedResults = await apiClient.getLiveResultsReports({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    electionId: sampleElectionDefinition.election.id,
  });

  // The round-trip (encode → store → decode → combine) only preserves
  // generic write-ins for contests in the submitted precinct. Non-precinct
  // contests get empty results without write-ins.
  const emptyContestResults = buildElectionResultsFixture({
    election: sampleElectionDefinition.election,
    cardCounts: { bmd: [], hmpb: [] },
    contestResultsSummaries: {},
    includeGenericWriteIn: false,
  }).contestResults;
  const precinctContestResults = filterContestResultsForPrecinct(
    mockResults.contestResults,
    sampleElectionDefinition.election,
    submittedPrecinctId
  );
  const expectedStoredContestResults: Record<
    ContestId,
    Tabulation.ContestResults
  > = {
    ...emptyContestResults,
    ...precinctContestResults,
  };
  expect(storedResults).toEqual(
    ok(
      expect.objectContaining({
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        ballotHash: sampleElectionDefinition.ballotHash,
        contestResults: expectedStoredContestResults,
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
      numPages: 1,
      pageIndex: 0,
      pollingPlaceId: 'test-polling-place',
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
  const mockResults2 = buildElectionResultsFixture({
    election: sampleElectionDefinition.election,
    cardCounts: {
      bmd: [],
      hmpb: [],
    },
    contestResultsSummaries: sampleContestResults,
    includeGenericWriteIn: true,
  });
  const encodedTally2 = compressAndEncodePerPrecinctTally({
    election: sampleElectionDefinition.election,
    resultsByPrecinct: { [submittedPrecinctId]: mockResults2 },
    numPages: 1,
  })[0];

  // Calling with updated data should overwrite the previous result.
  const result3 = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr3//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'machineId',
      timestamp: new Date('2024-01-02T12:00:00Z').getTime() / 1000,
      isLiveMode: true,
      primaryMessage: encodedTally2,
      numPages: 1,
      pageIndex: 0,
      pollingPlaceId: 'test-polling-place',
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
        pollingPlaceId: 'test-polling-place',
        pollsTransitionType: 'close_polls',
        pollsTransitionTime: new Date('2024-01-02T12:00:00Z'),
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        contestResultsByPrecinct: expect.objectContaining({
          [submittedPrecinctId]: expect.objectContaining({
            [sampleContest.id]: expect.objectContaining({
              ballots: 10,
              undervotes: 5,
              overvotes: 2,
            }),
          }),
        }),
      })
    )
  );
  const storedResults2 = await apiClient.getLiveResultsReports({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    electionId: sampleElectionDefinition.election.id,
  });
  expect(storedResults2).toEqual(
    ok(
      expect.objectContaining({
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        ballotHash: sampleElectionDefinition.ballotHash,
        contestResults: expect.objectContaining({
          [sampleContest.id]: expect.objectContaining({
            ballots: 10,
            undervotes: 5,
            overvotes: 2,
          }),
        }),
        machinesReporting: ['machineId'],
        isLive: true,
      })
    )
  );

  // Querying for a specific precinct returns only that precinct's data.
  // Results were submitted for precincts[0], so other precincts have no data.
  for (const precinct of sampleElectionDefinition.election.precincts) {
    const storedResultsForPrecinct = await apiClient.getLiveResultsReports({
      precinctSelection: singlePrecinctSelectionFor(precinct.id),
      electionId: sampleElectionDefinition.election.id,
    });
    const isSubmittedPrecinct =
      precinct.id === sampleElectionDefinition.election.precincts[0].id;
    expect(storedResultsForPrecinct).toEqual(
      ok({
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        ballotHash: sampleElectionDefinition.ballotHash,
        contestResults: expect.anything(),
        machinesReporting: isSubmittedPrecinct ? ['machineId'] : [],
        isLive: true,
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
          ballots:
            isSubmittedPrecinct && contest.id === sampleContest.id ? 10 : 0,
        })
      );
    }
  }
  const pollsStatus = await apiClient.getLiveReportsSummary({
    electionId: sampleElectionDefinition.election.id,
  });
  expect(pollsStatus).toEqual(
    ok({
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      ballotHash: sampleElectionDefinition.ballotHash,
      isLive: true,
      reportsByPollingPlace: {
        'test-polling-place': [
          {
            machineId: 'machineId',
            pollingPlaceId: 'test-polling-place',
            pollsTransitionType: 'close_polls',
            signedTimestamp: new Date('2024-01-02T12:00:00.000Z'),
          },
        ],
      },
    })
  );
  const activityLogStatus = await apiClient.getLiveReportsActivityLog({
    electionId: sampleElectionDefinition.election.id,
  });
  expect(activityLogStatus).toEqual(
    ok({
      activityLog: [
        {
          machineId: 'machineId',
          pollingPlaceId: 'test-polling-place',
          pollsTransitionType: 'close_polls',
          signedTimestamp: new Date('2024-01-02T12:00:00.000Z'),
        },
      ],
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
      numPages: 1,
      pageIndex: 0,
      pollingPlaceId: 'test-polling-place',
      ballotCount: 0,
      votingType: 'election_day',
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(result4).toEqual(ok(expect.anything()));
  const storedResults3 = await apiClient.getLiveResultsReports({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    electionId: sampleElectionDefinition.election.id,
  });
  expect(storedResults3).toEqual(
    ok({
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      ballotHash: sampleElectionDefinition.ballotHash,
      contestResults: expect.objectContaining({
        [sampleContest.id]: expect.objectContaining({
          ballots: 20,
          undervotes: 10,
          overvotes: 4,
        }),
      }),
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
      primaryMessage: 'open_polls',
      numPages: 1,
      pageIndex: 0,
      pollingPlaceId: 'test-polling-place',
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
        pollingPlaceId: 'test-polling-place',
        pollsTransitionType: 'open_polls',
        machineId: 'mock-01',
        isLive: false,
        isPartial: false,
        ballotCount: 0,
        votingType: 'election_day',
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
        pollingPlaceId: precinctId,
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
        pollingPlaceId: precinctId,
        pollsTransitionType: 'open_polls',
        machineId: 'mock-02',
        isLive: false,
        pollsTransitionTime: new Date('2024-05-04T09:00:00Z'),
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
      })
    )
  );

  const pollsStatus = await apiClient.getLiveReportsSummary({
    electionId: sampleElectionDefinition.election.id,
  });
  expect(pollsStatus).toEqual(
    ok(
      expect.objectContaining({
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        ballotHash: sampleElectionDefinition.ballotHash,
        isLive: false,
        reportsByPollingPlace: expect.objectContaining({
          [precinctId]: [
            {
              machineId: 'mock-02',
              pollingPlaceId: precinctId,
              pollsTransitionType: 'open_polls',
              signedTimestamp: new Date('2024-05-04T09:00:00Z'),
            },
          ],
          'test-polling-place': [
            {
              machineId: 'mock-01',
              pollingPlaceId: 'test-polling-place',
              pollsTransitionType: 'open_polls',
              signedTimestamp: new Date('2024-05-04T08:00:00Z'),
            },
          ],
        }),
      })
    )
  );
  const activityLogStatus = await apiClient.getLiveReportsActivityLog({
    electionId: sampleElectionDefinition.election.id,
  });
  expect(activityLogStatus).toEqual(
    ok({
      activityLog: [
        {
          machineId: 'mock-02',
          pollingPlaceId: precinctId,
          pollsTransitionType: 'open_polls',
          signedTimestamp: new Date('2024-05-04T09:00:00Z'),
        },
        {
          machineId: 'mock-01',
          pollingPlaceId: 'test-polling-place',
          pollsTransitionType: 'open_polls',
          signedTimestamp: new Date('2024-05-04T08:00:00Z'),
        },
      ],
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
  const closePrecinctId = sampleElectionDefinition.election.precincts[0].id;
  const encodedTally = compressAndEncodePerPrecinctTally({
    election: sampleElectionDefinition.election,
    resultsByPrecinct: { [closePrecinctId]: mockResults },
    numPages: 1,
  })[0];

  const result = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr3//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'mock-01',
      timestamp: new Date('2024-05-04T12:00:00Z').getTime() / 1000, // this time is more recent then the polls open
      isLiveMode: false,
      primaryMessage: encodedTally,
      numPages: 1,
      pageIndex: 0,
      pollingPlaceId: 'test-polling-place',
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
        pollingPlaceId: 'test-polling-place',
        pollsTransitionType: 'close_polls',
        machineId: 'mock-01',
        isLive: false,
        pollsTransitionTime: new Date('2024-05-04T12:00:00Z'),
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        contestResultsByPrecinct: expect.objectContaining({
          [closePrecinctId]: filterContestResultsForPrecinct(
            mockResults.contestResults,
            sampleElectionDefinition.election,
            closePrecinctId
          ),
        }),
      })
    )
  );

  const pollsStatusUpdated = await apiClient.getLiveReportsSummary({
    electionId: sampleElectionDefinition.election.id,
  });
  expect(pollsStatusUpdated).toEqual(
    ok(
      expect.objectContaining({
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        isLive: false,
        ballotHash: sampleElectionDefinition.ballotHash,
        reportsByPollingPlace: expect.objectContaining({
          [precinctId]: [
            {
              machineId: 'mock-02',
              pollingPlaceId: precinctId,
              pollsTransitionType: 'open_polls',
              signedTimestamp: new Date('2024-05-04T09:00:00Z'),
            },
          ],
          'test-polling-place': [
            {
              machineId: 'mock-01',
              pollingPlaceId: 'test-polling-place',
              pollsTransitionType: 'close_polls',
              signedTimestamp: new Date('2024-05-04T12:00:00Z'),
            },
          ],
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
        primaryMessage: 'open_polls',
        numPages: 1,
        pageIndex: 0,
        pollingPlaceId: 'test-polling-place',
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
      pollingPlaceId: 'test-polling-place',
      pollsTransitionType: 'open_polls',
      machineId: 'mock-01',

      isLive: true,
      pollsTransitionTime: new Date('2024-05-05T08:00:00Z'),
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
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
    ok(
      expect.objectContaining({
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
        isLive: true,
        ballotHash: sampleElectionDefinition.ballotHash,
        reportsByPollingPlace: expect.objectContaining({
          'test-polling-place': [
            {
              machineId: 'mock-01',

              pollingPlaceId: 'test-polling-place',
              pollsTransitionType: 'open_polls',
              signedTimestamp: new Date('2024-05-05T08:00:00Z'),
            },
          ],
        }),
      })
    )
  );
  const activityLogLiveMode = await apiClient.getLiveReportsActivityLog({
    electionId: sampleElectionDefinition.election.id,
  });
  expect(activityLogLiveMode).toEqual(
    ok({
      activityLog: [
        {
          machineId: 'mock-01',
          pollingPlaceId: 'test-polling-place',
          pollsTransitionType: 'open_polls',
          signedTimestamp: new Date('2024-05-05T08:00:00Z'),
        },
      ],
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
      pollingPlaceId: precinctId,
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
        pollingPlaceId: precinctId,
        pollsTransitionType: 'pause_voting',
        machineId: 'mock-01',
        isLive: false,
        pollsTransitionTime: new Date('2024-05-04T10:00:00Z'),
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
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
        reportsByPollingPlace: expect.objectContaining({
          [precinctId]: [
            {
              machineId: 'mock-01',
              pollingPlaceId: precinctId,
              pollsTransitionType: 'pause_voting',
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
      pollingPlaceId: precinctId,
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
        pollingPlaceId: precinctId,
        pollsTransitionType: 'resume_voting',
        machineId: 'mock-01',
        isLive: false,
        pollsTransitionTime: new Date('2024-05-04T11:00:00Z'),
        election: expect.objectContaining({
          id: sampleElectionDefinition.election.id,
        }),
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
        reportsByPollingPlace: expect.objectContaining({
          [precinctId]: [
            {
              machineId: 'mock-01',
              pollingPlaceId: precinctId,
              pollsTransitionType: 'resume_voting',
              signedTimestamp: new Date('2024-05-04T11:00:00Z'),
            },
          ],
        }),
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
  const encodedTallyFirstPrecinct = compressAndEncodePerPrecinctTally({
    election: sampleElectionDefinition.election,
    resultsByPrecinct: { [firstPrecinctId]: mockResultsFirstPrecinct },
    numPages: 1,
  })[0];

  const resultFirstPrecinct =
    await unauthenticatedApiClient.processQrCodeReport({
      payload: `1//qr3//${encodeQuickResultsMessage({
        ballotHash: sampleElectionDefinition.ballotHash,
        signingMachineId: 'first-precinct-machine',
        timestamp: new Date('2024-01-01T12:00:00Z').getTime() / 1000,
        isLiveMode: true,
        pollingPlaceId: firstPrecinctId,
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
        pollingPlaceId: firstPrecinctId,
        contestResultsByPrecinct: {
          [firstPrecinctId]: filterContestResultsForPrecinct(
            mockResultsFirstPrecinct.contestResults,
            sampleElectionDefinition.election,
            firstPrecinctId
          ),
        },
      })
    )
  );
  // Report data from second precinct
  const encodedTallySecondPrecinct = compressAndEncodePerPrecinctTally({
    election: sampleElectionDefinition.election,
    resultsByPrecinct: { [secondPrecinctId]: mockResultsSecondPrecinct },
    numPages: 1,
  })[0];

  const resultSecondPrecinct =
    await unauthenticatedApiClient.processQrCodeReport({
      payload: `1//qr3//${encodeQuickResultsMessage({
        ballotHash: sampleElectionDefinition.ballotHash,
        signingMachineId: 'second-precinct-machine',
        timestamp: new Date('2024-01-01T13:00:00Z').getTime() / 1000,
        isLiveMode: true,
        pollingPlaceId: secondPrecinctId,
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
        pollingPlaceId: secondPrecinctId,
        contestResultsByPrecinct: {
          [secondPrecinctId]: filterContestResultsForPrecinct(
            mockResultsSecondPrecinct.contestResults,
            sampleElectionDefinition.election,
            secondPrecinctId
          ),
        },
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

  // Verify getting results for all precincts aggregates the single-precinct
  // reports correctly
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
  const contestResultsAllPrecincts = assertDefined(
    storedResultsAllPrecincts.ok()
  ).contestResults;
  expect(Object.keys(contestResultsAllPrecincts)).toEqual(
    sampleElectionDefinition.election.contests.map((c) => c.id)
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
  const encodedTally = compressAndEncodePerPrecinctTally({
    election: sampleElectionDefinition.election,
    resultsByPrecinct: {
      [sampleElectionDefinition.election.precincts[0].id]: mockResults,
    },
    numPages: 1,
  })[0];

  // Submit test results (isLiveMode: false)
  const testResult = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr3//${encodeQuickResultsMessage({
      ballotHash: sampleElectionDefinition.ballotHash,
      signingMachineId: 'test-machine-test',
      timestamp: new Date('2024-01-01T13:00:00Z').getTime() / 1000,
      isLiveMode: false,
      primaryMessage: encodedTally,
      numPages: 1,
      pageIndex: 0,
      pollingPlaceId: 'test-polling-place',
      ballotCount: 0,
      votingType: 'election_day',
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(testResult).toEqual(ok(expect.anything()));

  auth0.setLoggedInUser(nonVxUser);

  const storedTestResults = await apiClient.getLiveResultsReports({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    electionId: sampleElectionDefinition.election.id,
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
      primaryMessage: encodedTally,
      numPages: 1,
      pageIndex: 0,
      pollingPlaceId: 'test-polling-place',
      ballotCount: 0,
      votingType: 'election_day',
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  expect(liveResult).toEqual(ok(expect.anything()));

  // Verify both live and test results exist before clearing
  const storedLiveResults = await apiClient.getLiveResultsReports({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    electionId: sampleElectionDefinition.election.id,
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
    precinctSelection: ALL_PRECINCTS_SELECTION,
    electionId: sampleElectionDefinition.election.id,
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

  const paginatedPrecinctId = sampleElectionDefinition.election.precincts[0].id;
  const sections = compressAndEncodePerPrecinctTally({
    election: sampleElectionDefinition.election,
    resultsByPrecinct: { [paginatedPrecinctId]: mockResults },
    numPages: 2,
  });
  // Sanity: should produce 2 sections
  expect(sections.length).toEqual(2);

  // Send page 1 (index 0) only
  const payloadPage1 = `1//qr3//${encodeQuickResultsMessage({
    ballotHash: sampleElectionDefinition.ballotHash,
    signingMachineId: 'paginated-machine',
    timestamp: new Date('2024-01-01T12:00:00Z').getTime() / 1000,
    isLiveMode: true,
    primaryMessage: sections[0],
    numPages: 2,
    pageIndex: 0,
    pollingPlaceId: 'test-polling-place',
    ballotCount: 0,
    votingType: 'election_day',
  })}`;

  const r1 = await unauthenticatedApiClient.processQrCodeReport({
    payload: payloadPage1,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  // Should accept page, but not return assembled contestResultsByPrecinct yet
  expect(r1).toEqual(
    ok(
      expect.objectContaining({
        pollingPlaceId: 'test-polling-place',
        pollsTransitionType: 'close_polls',
        isPartial: true,
        numPages: 2,
        pageIndex: 0,
      })
    )
  );

  // Query stored results -> should not have machines reporting assembled data yet
  auth0.setLoggedInUser(nonVxUser);
  const storedAfterPage1 = await apiClient.getLiveResultsReports({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    electionId: sampleElectionDefinition.election.id,
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
    primaryMessage: sections[1],
    numPages: 2,
    pageIndex: 1,
    pollingPlaceId: 'test-polling-place',
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
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      pollingPlaceId: 'test-polling-place',
      pollsTransitionType: 'close_polls',
      isLive: true,
      pollsTransitionTime: new Date('2024-01-01T12:00:01Z'),
      contestResultsByPrecinct: expect.objectContaining({
        [paginatedPrecinctId]: expect.objectContaining({
          [contestId1]: expect.objectContaining({
            ballots: 100,
            undervotes: 10,
            overvotes: 5,
          }),
          [contestIdLast]: expect.objectContaining({
            ballots: 200,
            undervotes: 20,
            overvotes: 10,
          }),
        }),
      }),
      isPartial: false,
      votingType: 'election_day',
    })
  );

  // Now the assembled result should be available
  auth0.setLoggedInUser(nonVxUser);
  const storedAfterPage2 = await apiClient.getLiveResultsReports({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    electionId: sampleElectionDefinition.election.id,
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
        contestResults: expect.objectContaining({
          [contestId1]: expect.objectContaining({
            ballots: 100,
            undervotes: 10,
            overvotes: 5,
          }),
          [contestIdLast]: expect.objectContaining({
            ballots: 200,
            undervotes: 20,
            overvotes: 10,
          }),
        }),
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

  const submittedPrecinctId = sampleElectionDefinition.election.precincts[0].id;

  const sections = compressAndEncodePerPrecinctTally({
    election: sampleElectionDefinition.election,
    resultsByPrecinct: {
      [submittedPrecinctId]: mockResults,
    },
    numPages: 2,
  });

  // Sanity: should produce 2 sections
  expect(sections.length).toEqual(2);

  // Send page 1 (index 0) only
  const payloadPage1 = `1//qr3//${encodeQuickResultsMessage({
    ballotHash: sampleElectionDefinition.ballotHash,
    signingMachineId: 'paginated-machine',
    timestamp: new Date('2024-01-01T12:00:00Z').getTime() / 1000,
    isLiveMode: true,
    primaryMessage: sections[0],
    numPages: 2,
    pageIndex: 0,
    pollingPlaceId: 'test-polling-place',
    ballotCount: 0,
    votingType: 'election_day',
  })}`;

  const r1 = await unauthenticatedApiClient.processQrCodeReport({
    payload: payloadPage1,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  // Should accept page, but not return assembled contestResultsByPrecinct yet
  expect(r1).toEqual(
    ok(
      expect.objectContaining({
        pollingPlaceId: 'test-polling-place',
        pollsTransitionType: 'close_polls',
        isPartial: true,
        numPages: 2,
        pageIndex: 0,
      })
    )
  );

  // Create a new url now with 3 pages
  const sectionsInThreePages = compressAndEncodePerPrecinctTally({
    election: sampleElectionDefinition.election,
    resultsByPrecinct: {
      [sampleElectionDefinition.election.precincts[0].id]: mockResults,
    },
    numPages: 3,
  });

  // Send page 2 (of now 3) - this should clear the previous partial report and NOT send results (like p2/2 would)
  const payloadPage2 = `1//qr3//${encodeQuickResultsMessage({
    ballotHash: sampleElectionDefinition.ballotHash,
    signingMachineId: 'paginated-machine',
    timestamp: new Date('2024-01-01T12:00:01Z').getTime() / 1000,
    isLiveMode: true,
    primaryMessage: sectionsInThreePages[1],
    numPages: 3,
    pageIndex: 1,
    pollingPlaceId: 'test-polling-place',
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
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      numPages: 3,
      pageIndex: 1,
      pollingPlaceId: 'test-polling-place',
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
    primaryMessage: sectionsInThreePages[2],
    numPages: 3,
    pageIndex: 2,
    pollingPlaceId: 'test-polling-place',
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
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      numPages: 3,
      pageIndex: 2,
      pollingPlaceId: 'test-polling-place',
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
    primaryMessage: sectionsInThreePages[0],
    numPages: 3,
    pageIndex: 0,
    pollingPlaceId: 'test-polling-place',
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
      election: expect.objectContaining({
        id: sampleElectionDefinition.election.id,
      }),
      pollingPlaceId: 'test-polling-place',
      pollsTransitionType: 'close_polls',
      isLive: true,
      pollsTransitionTime: new Date('2024-01-01T12:00:00Z'),
      contestResultsByPrecinct: {
        [submittedPrecinctId]: filterContestResultsForPrecinct(
          mockResults.contestResults,
          sampleElectionDefinition.election,
          submittedPrecinctId
        ),
      },
      isPartial: false,
      votingType: 'election_day',
    })
  );
});

test('quick results clears previous partial reports when pollingPlaceId changes', async () => {
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

  const sections = compressAndEncodePerPrecinctTally({
    election: sampleElectionDefinition.election,
    resultsByPrecinct: { [precinctA]: mockResults },
    numPages: 2,
  });

  // Submit page 1 for precinct A (partial)
  const payloadA1 = `1//qr3//${encodeQuickResultsMessage({
    ballotHash: sampleElectionDefinition.ballotHash,
    signingMachineId: 'machine-x',
    timestamp: new Date('2024-01-01T10:00:00Z').getTime() / 1000,
    isLiveMode: true,
    pollingPlaceId: precinctA,
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
  const sectionsB = compressAndEncodePerPrecinctTally({
    election: sampleElectionDefinition.election,
    resultsByPrecinct: { [precinctB]: mockResults },
    numPages: 2,
  });

  const payloadB1 = `1//qr3//${encodeQuickResultsMessage({
    ballotHash: sampleElectionDefinition.ballotHash,
    signingMachineId: 'machine-x',
    timestamp: new Date('2024-01-01T10:00:01Z').getTime() / 1000,
    isLiveMode: true,
    pollingPlaceId: precinctB,
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
  const payloadC1 = `1//qr3//${encodeQuickResultsMessage({
    ballotHash: sampleElectionDefinition.ballotHash,
    signingMachineId: 'machine-x',
    timestamp: new Date('2024-01-01T10:00:02Z').getTime() / 1000,
    isLiveMode: true,
    primaryMessage: sections[1],
    numPages: 2,
    pageIndex: 1,
    pollingPlaceId: 'test-polling-place',
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
    pollingPlaceId: precinctA,
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
        contestResultsByPrecinct: expect.objectContaining({
          [precinctA]: filterContestResultsForPrecinct(
            mockResults.contestResults,
            sampleElectionDefinition.election,
            precinctA
          ),
        }),
        votingType: 'election_day',
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
  const encodedTally = compressAndEncodePerPrecinctTally({
    election: reorderedElectionDefinition.election,
    resultsByPrecinct: {
      [reorderedElectionDefinition.election.precincts[0].id]: mockResults,
    },
    numPages: 1,
  })[0];

  auth0.logOut();

  const reportResult = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr3//${encodeQuickResultsMessage({
      ballotHash: electionPackage.electionDefinition.ballotHash,
      signingMachineId: 'test-machine',
      timestamp: new Date('2024-01-01T12:00:00Z').getTime() / 1000,
      isLiveMode: true,
      primaryMessage: encodedTally,
      numPages: 1,
      pageIndex: 0,
      pollingPlaceId: 'test-polling-place',
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
    precinctSelection: ALL_PRECINCTS_SELECTION,
    electionId,
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

// --- Activity log and votingGroup filter tests ---

async function sendTransitionReport(
  unauthenticatedApiClient: grout.Client<UnauthenticatedApi>,
  {
    ballotHash,
    machineId,
    pollingPlaceId,
    timestamp,
    transition = 'open_polls',
    isLive = true,
    ballotCount = 0,
  }: {
    ballotHash: string;
    machineId: string;
    pollingPlaceId: string;
    timestamp: Date;
    transition?: 'open_polls' | 'pause_voting' | 'resume_voting';
    isLive?: boolean;
    ballotCount?: number;
  }
): Promise<void> {
  const result = await unauthenticatedApiClient.processQrCodeReport({
    payload: `1//qr3//${encodeQuickResultsMessage({
      ballotHash,
      signingMachineId: machineId,
      timestamp: timestamp.getTime() / 1000,
      isLiveMode: isLive,
      primaryMessage: transition,
      numPages: 1,
      pageIndex: 0,
      pollingPlaceId,
      ballotCount,
      votingType: 'election_day',
    })}`,
    signature: 'test-signature',
    certificate: 'test-certificate',
  });
  result.unsafeUnwrap();
}

test('getLiveReportsActivityLog returns activity log ordered by timestamp desc', async () => {
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
  const { ballotHash } = sampleElectionDefinition;
  const electionId = sampleElectionDefinition.election.id;

  // Submit three reports out of chronological order
  await sendTransitionReport(unauthenticatedApiClient, {
    ballotHash,
    machineId: 'machine-b',
    pollingPlaceId: 'pp-b',
    timestamp: new Date('2024-01-01T09:00:00Z'),
  });
  await sendTransitionReport(unauthenticatedApiClient, {
    ballotHash,
    machineId: 'machine-a',
    pollingPlaceId: 'pp-a',
    timestamp: new Date('2024-01-01T07:00:00Z'),
  });
  await sendTransitionReport(unauthenticatedApiClient, {
    ballotHash,
    machineId: 'machine-c',
    pollingPlaceId: 'pp-c',
    timestamp: new Date('2024-01-01T08:00:00Z'),
  });

  const activityLogStatus = await apiClient.getLiveReportsActivityLog({
    electionId,
  });
  expect(activityLogStatus.unsafeUnwrap().activityLog).toEqual([
    {
      machineId: 'machine-b',
      pollingPlaceId: 'pp-b',
      pollsTransitionType: 'open_polls',
      signedTimestamp: new Date('2024-01-01T09:00:00Z'),
    },
    {
      machineId: 'machine-c',
      pollingPlaceId: 'pp-c',
      pollsTransitionType: 'open_polls',
      signedTimestamp: new Date('2024-01-01T08:00:00Z'),
    },
    {
      machineId: 'machine-a',
      pollingPlaceId: 'pp-a',
      pollsTransitionType: 'open_polls',
      signedTimestamp: new Date('2024-01-01T07:00:00Z'),
    },
  ]);
});

test('getLiveReportsActivityLog includes every state change for a machine', async () => {
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
  const { ballotHash } = sampleElectionDefinition;
  const electionId = sampleElectionDefinition.election.id;

  // Same machine: open, then pause, then resume
  await sendTransitionReport(unauthenticatedApiClient, {
    ballotHash,
    machineId: 'machine-a',
    pollingPlaceId: 'pp-a',
    timestamp: new Date('2024-01-01T07:00:00Z'),
  });
  await sendTransitionReport(unauthenticatedApiClient, {
    ballotHash,
    machineId: 'machine-a',
    pollingPlaceId: 'pp-a',
    timestamp: new Date('2024-01-01T12:00:00Z'),
    transition: 'pause_voting',
  });
  await sendTransitionReport(unauthenticatedApiClient, {
    ballotHash,
    machineId: 'machine-a',
    pollingPlaceId: 'pp-a',
    timestamp: new Date('2024-01-01T13:00:00Z'),
    transition: 'resume_voting',
    ballotCount: 10,
  });

  const activityLogStatus = await apiClient.getLiveReportsActivityLog({
    electionId,
  });
  const { activityLog } = activityLogStatus.unsafeUnwrap();
  expect(activityLog).toHaveLength(3);
  expect(activityLog.map((entry) => entry.pollsTransitionType)).toEqual([
    'resume_voting',
    'pause_voting',
    'open_polls',
  ]);

  // reportsByPollingPlace still only returns the latest per machine
  const pollsStatus = await apiClient.getLiveReportsSummary({ electionId });
  const reports =
    pollsStatus.unsafeUnwrap().reportsByPollingPlace['pp-a'] ?? [];
  expect(reports).toHaveLength(1);
  expect(reports[0].pollsTransitionType).toEqual('resume_voting');
});

test('getLiveReportsActivityLog limits activity log to MAX_LIVE_REPORT_ACTIVITY_ITEMS', async () => {
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
  const { ballotHash } = sampleElectionDefinition;
  const electionId = sampleElectionDefinition.election.id;

  const totalReports = MAX_LIVE_REPORT_ACTIVITY_ITEMS + 5;
  const baseTime = new Date('2024-01-01T00:00:00Z').getTime();
  for (let i = 0; i < totalReports; i += 1) {
    await sendTransitionReport(unauthenticatedApiClient, {
      ballotHash,
      machineId: `machine-${i.toString().padStart(3, '0')}`,
      pollingPlaceId: `pp-${i.toString().padStart(3, '0')}`,
      timestamp: new Date(baseTime + i * 60 * 1000),
    });
  }

  const activityLogStatus = await apiClient.getLiveReportsActivityLog({
    electionId,
  });
  const { activityLog } = activityLogStatus.unsafeUnwrap();
  expect(activityLog).toHaveLength(MAX_LIVE_REPORT_ACTIVITY_ITEMS);
  // Oldest entries are dropped - only the most recent 50 remain
  const machineIds = activityLog.map((entry) => entry.machineId);
  expect(machineIds[0]).toEqual(
    `machine-${(totalReports - 1).toString().padStart(3, '0')}`
  );
  expect(machineIds).not.toContain('machine-000');
});

test('getLiveReportsActivityLog filters activity log by votingGroup', async () => {
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
  const { ballotHash } = sampleElectionDefinition;
  const electionId = sampleElectionDefinition.election.id;
  const firstPrecinctId = sampleElectionDefinition.election.precincts[0].id;

  // Set up polling places of each voting type. The polling places need to
  // live in the database so the JOIN on polling_places.type works.
  const placesByType: Record<PollingPlaceType, PollingPlace> = {
    election_day: {
      id: 'pp-ed',
      name: 'Election Day Place',
      type: 'election_day',
      precincts: { [firstPrecinctId]: { type: 'whole' } },
    },
    early_voting: {
      id: 'pp-ev',
      name: 'Early Voting Place',
      type: 'early_voting',
      precincts: { [firstPrecinctId]: { type: 'whole' } },
    },
    absentee: {
      id: 'pp-abs',
      name: 'Absentee Place',
      type: 'absentee',
      precincts: { [firstPrecinctId]: { type: 'whole' } },
    },
  };
  for (const place of Object.values(placesByType)) {
    (await apiClient.setPollingPlace({ electionId, place })).unsafeUnwrap();
  }

  // Submit one report for each polling place
  await sendTransitionReport(unauthenticatedApiClient, {
    ballotHash,
    machineId: 'machine-ed',
    pollingPlaceId: placesByType.election_day.id,
    timestamp: new Date('2024-01-01T07:00:00Z'),
  });
  await sendTransitionReport(unauthenticatedApiClient, {
    ballotHash,
    machineId: 'machine-ev',
    pollingPlaceId: placesByType.early_voting.id,
    timestamp: new Date('2024-01-01T08:00:00Z'),
  });
  await sendTransitionReport(unauthenticatedApiClient, {
    ballotHash,
    machineId: 'machine-abs',
    pollingPlaceId: placesByType.absentee.id,
    timestamp: new Date('2024-01-01T09:00:00Z'),
  });

  // No votingGroup -> all entries
  const allStatus = await apiClient.getLiveReportsActivityLog({ electionId });
  expect(
    allStatus.unsafeUnwrap().activityLog.map((entry) => entry.machineId)
  ).toEqual(['machine-abs', 'machine-ev', 'machine-ed']);

  // election_day -> only election day entries
  const edStatus = await apiClient.getLiveReportsActivityLog({
    electionId,
    votingGroup: 'election_day',
  });
  expect(edStatus.unsafeUnwrap().activityLog).toEqual([
    {
      machineId: 'machine-ed',
      pollingPlaceId: placesByType.election_day.id,
      pollsTransitionType: 'open_polls',
      signedTimestamp: new Date('2024-01-01T07:00:00Z'),
    },
  ]);

  // early_voting -> only early voting entries
  const evStatus = await apiClient.getLiveReportsActivityLog({
    electionId,
    votingGroup: 'early_voting',
  });
  expect(evStatus.unsafeUnwrap().activityLog).toEqual([
    {
      machineId: 'machine-ev',
      pollingPlaceId: placesByType.early_voting.id,
      pollsTransitionType: 'open_polls',
      signedTimestamp: new Date('2024-01-01T08:00:00Z'),
    },
  ]);

  // absentee -> only absentee entries
  const absStatus = await apiClient.getLiveReportsActivityLog({
    electionId,
    votingGroup: 'absentee',
  });
  expect(absStatus.unsafeUnwrap().activityLog).toEqual([
    {
      machineId: 'machine-abs',
      pollingPlaceId: placesByType.absentee.id,
      pollsTransitionType: 'open_polls',
      signedTimestamp: new Date('2024-01-01T09:00:00Z'),
    },
  ]);
});

test('getLiveReportsActivityLog filter still honors the MAX limit', async () => {
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
  const { ballotHash } = sampleElectionDefinition;
  const electionId = sampleElectionDefinition.election.id;
  const firstPrecinctId = sampleElectionDefinition.election.precincts[0].id;

  const edPlace: PollingPlace = {
    id: 'pp-ed',
    name: 'Election Day Place',
    type: 'election_day',
    precincts: { [firstPrecinctId]: { type: 'whole' } },
  };
  (
    await apiClient.setPollingPlace({ electionId, place: edPlace })
  ).unsafeUnwrap();

  const totalReports = MAX_LIVE_REPORT_ACTIVITY_ITEMS + 3;
  const baseTime = new Date('2024-01-01T00:00:00Z').getTime();
  for (let i = 0; i < totalReports; i += 1) {
    await sendTransitionReport(unauthenticatedApiClient, {
      ballotHash,
      machineId: `machine-${i.toString().padStart(3, '0')}`,
      pollingPlaceId: edPlace.id,
      timestamp: new Date(baseTime + i * 60 * 1000),
    });
  }

  const edStatus = await apiClient.getLiveReportsActivityLog({
    electionId,
    votingGroup: 'election_day',
  });
  expect(edStatus.unsafeUnwrap().activityLog).toHaveLength(
    MAX_LIVE_REPORT_ACTIVITY_ITEMS
  );
});
