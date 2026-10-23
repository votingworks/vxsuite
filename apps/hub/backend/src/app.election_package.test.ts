import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import JsZip from 'jszip';
import {
  assert,
  assertDefined,
  deferred,
  find,
  iter,
  range,
} from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryFixtures,
  makeTemporaryFile,
  electionGridLayoutNewHampshireTestBallotFixtures,
} from '@votingworks/fixtures';
import {
  type BallotMode,
  type BaseBallotProps,
  AdjudicationReason,
  HmpbBallotPaperSize,
  BallotType,
  type CandidateContest,
  DEFAULT_SYSTEM_SETTINGS,
  type Election,
  ElectionStringKey,
  type SystemSettings,
  type UiStringsPackage,
  formatBallotHash,
  formatElectionPackageHash,
  mergeUiStrings,
  LanguageCode,
  NEEDS_TRANSLITERATED_NAMES,
  hasSplits,
  BALLOT_MODES,
  safeParseJson,
  pollingPlacesGenerateFromPrecincts,
  type PrecinctWithSplits,
  type ElectionRegisteredVoterCounts,
  ElectionPackageFileName,
  safeParseElectionV4p0,
  LATEST_SOFTWARE_VERSION,
  convertLatestElectionToV4p0,
  type EncodedBallotEntry,
  type UiStringAudioClip,
  BallotPositionsSchema,
  BallotCandidateOrderingsSchema,
  unsafeParseJson,
} from '@votingworks/types';
import {
  getEntries,
  getFeatureFlagMock,
  getFileByName,
  openZip,
  readTextEntry,
} from '@votingworks/utils';
import {
  forEachUiString,
  isMockCloudSynthesizedSpeech,
  mockCloudTranslatedText,
  openElectionPackageBuffer as openElectionPackageZipBuffer,
  readElectionPackageFromBuffer,
  streamElectionPackageAudioClips,
  streamElectionPackageBallots,
  withElectionPackageZip,
} from '@votingworks/backend';
import {
  backendWaitFor,
  countObjectLeaves,
  getObjectLeaves,
  suppressingConsoleOutput,
} from '@votingworks/test-utils';
import {
  allBaseBallotProps,
  ballotTemplates,
  hmpbStringsCatalog,
  renderAllBallotPdfsAndCreateElectionDefinition,
  type ScratchDir,
} from '@votingworks/hmpb';
import path from 'node:path';
import { createSummaryBallotTestDeck } from '@votingworks/test-decks';
import {
  ELECTION_PACKAGE_FILE_NAME_REGEX,
  exportElectionPackage,
  getExportedFile,
  processNextBackgroundTaskIfAny,
  testSetupHelpers,
} from '../test/helpers.js';
import {
  createPrecinctTestDeck,
  createTestDeckTallyReports,
} from './test_decks.js';
import type { Jurisdiction, JurisdictionUser } from './types.js';
import type { MainExportTaskMetadata } from './store.js';
import { getStateFeaturesConfig } from './features.js';
import {
  organizations,
  jurisdictions,
  users,
  nonVxUser,
  nonVxJurisdiction,
  anotherNonVxUser,
} from '../test/mocks.js';

vi.setConfig({
  testTimeout: 120_000,
});

const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

vi.mock('./ballot_style_reports.js');

// Spy on the ballot rendering function so we can check that it's called with the
// right arguments.
vi.mock(import('@votingworks/hmpb'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    createElectionDefinition: vi.fn(original.createElectionDefinition),
    renderAllBallotPdfsAndCreateElectionDefinition: vi.fn(
      original.renderAllBallotPdfsAndCreateElectionDefinition
    ),
    layOutBallots: vi.fn(original.layOutBallots),
  } as unknown as typeof original;
});

// Mock decryption for ballotAuditIds
vi.mock('@votingworks/auth', async (importActual) => ({
  ...(await importActual()),
  decryptAes256: vi
    .fn()
    .mockImplementation((_key, data) => `decrypted-${data}`),
}));

// Spy on test deck functions so we can mock them in specific tests
vi.mock(import('./test_decks.js'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    createPrecinctTestDeck: vi.fn(original.createPrecinctTestDeck),
    createTestDeckTallyReports: vi.fn(original.createTestDeckTallyReports),
  };
});

vi.mock(import('@votingworks/test-decks'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    createSummaryBallotTestDeck: vi.fn(original.createSummaryBallotTestDeck),
  };
});

const ANY_SCRATCH_DIR: ScratchDir = { path: expect.any(String) };

const { setupApp, cleanup } = testSetupHelpers();

function expectedEnglishBallotStrings(election: Election): UiStringsPackage {
  const expectedStrings = mergeUiStrings(election.ballotStrings, {
    [LanguageCode.ENGLISH]: hmpbStringsCatalog,
  });
  const splitNameEntries = election.precincts
    .filter(hasSplits)
    .flatMap((p) => p.splits.map(({ id, name }) => [id, name]));
  return {
    ...expectedStrings,
    [LanguageCode.ENGLISH]: {
      ...expectedStrings[LanguageCode.ENGLISH]!,
      ballotStyleId: Object.fromEntries(
        election.ballotStyles.map(({ id, groupId }) => [id, groupId])
      ),
      districtName: Object.fromEntries(
        election.districts.map(({ id, name }) => [id, name])
      ),
      pollingPlaceName: Object.fromEntries(
        (election.pollingPlaces || []).map(({ id, name }) => [id, name])
      ),
      precinctName: Object.fromEntries(
        election.precincts.map(({ id, name }) => [id, name])
      ),
      precinctSplitName:
        splitNameEntries.length > 0
          ? Object.fromEntries(splitNameEntries)
          : undefined,
      partyName: Object.fromEntries(
        election.parties.map(({ id, name }) => [id, name])
      ),
      partyFullName: Object.fromEntries(
        election.parties.map(({ id, fullName }) => [id, fullName])
      ),
      contestTitle: Object.fromEntries(
        election.contests.map(({ id, title }) => [id, title])
      ),
      candidateName: Object.fromEntries(
        election.contests
          .filter(
            (contest): contest is CandidateContest =>
              contest.type === 'candidate'
          )
          .flatMap((contest) =>
            contest.candidates.map(({ id, name }) => [id, name])
          )
      ),
    },
  };
}

afterAll(cleanup);

beforeEach(() => {
  mockFeatureFlagger.resetFeatureFlags();
});

afterEach(() => {
  vi.mocked(renderAllBallotPdfsAndCreateElectionDefinition).mockRestore();
  vi.mocked(createPrecinctTestDeck).mockRestore();
  vi.mocked(createSummaryBallotTestDeck).mockRestore();
  vi.mocked(createTestDeckTallyReports).mockRestore();
});

function readBallotsFromElectionPackage(
  electionPackageContents: Buffer
): Promise<EncodedBallotEntry[]> {
  return withElectionPackageZip(
    makeTemporaryFile({ content: electionPackageContents }),
    (zip) => iter(streamElectionPackageBallots(zip)).toArray()
  );
}

function readAudioClipsFromElectionPackage(
  electionPackageContents: Buffer
): Promise<UiStringAudioClip[]> {
  return withElectionPackageZip(
    makeTemporaryFile({ content: electionPackageContents }),
    (zip) => iter(streamElectionPackageAudioClips(zip)).toArray()
  );
}

test('Election package management', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { apiClient, workspace, fileStorageClient, auth0, baseUrl } =
    await setupApp({ organizations, jurisdictions, users });

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id',
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: baseElectionDefinition.electionData,
      },
    })
  ).unsafeUnwrap();

  const electionPackageBeforeExport = await apiClient.getElectionPackage({
    electionId,
  });
  expect(electionPackageBeforeExport).toEqual({});

  // Initiate an export
  await apiClient.exportElectionPackage({
    electionId,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: true,
    shouldExportTestBallots: true,
  });

  const expectedPayload = JSON.stringify({
    electionId,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: true,
    shouldExportTestBallots: true,
  });
  const electionPackageAfterInitiatingExport =
    await apiClient.getElectionPackage({ electionId });
  expect(electionPackageAfterInitiatingExport).toEqual<MainExportTaskMetadata>({
    task: {
      createdAt: expect.any(Date),
      id: expect.any(String),
      payload: expectedPayload,
      taskName: 'generate_election_package',
    },
  });
  const taskId = assertDefined(electionPackageAfterInitiatingExport.task).id;

  // Check that initiating an export before a prior has completed doesn't trigger a new background
  // task (even with a different serialization format)
  await apiClient.exportElectionPackage({
    electionId,
    electionSerializationFormat: 'cdf',
    shouldExportAudio: false,
    shouldExportSampleBallots: true,
    shouldExportTestBallots: true,
  });
  const electionPackageAfterInitiatingRedundantExport =
    await apiClient.getElectionPackage({ electionId });
  expect(electionPackageAfterInitiatingRedundantExport).toEqual(
    electionPackageAfterInitiatingExport
  );

  // Mock the ballot documents and election definition to speed up this test,
  // since we are just testing the export task flows in this test. The next test
  // checks the actual exported data.
  const props = allBaseBallotProps(baseElectionDefinition.election);
  const deferredRenderResult =
    deferred<
      Awaited<ReturnType<typeof renderAllBallotPdfsAndCreateElectionDefinition>>
    >();
  vi.mocked(renderAllBallotPdfsAndCreateElectionDefinition).mockReturnValue(
    deferredRenderResult.promise
  );

  // Run the background task, emitting progress updates along the way
  const taskPromise = processNextBackgroundTaskIfAny({
    fileStorageClient,
    workspace,
  });
  await backendWaitFor(
    () =>
      expect(
        vi.mocked(renderAllBallotPdfsAndCreateElectionDefinition)
      ).toHaveBeenCalled(),
    { interval: 500, retries: 3 }
  );
  const emitProgress = vi.mocked(renderAllBallotPdfsAndCreateElectionDefinition)
    .mock.lastCall![6]!;
  emitProgress('Test progress message', 2, 10);

  await backendWaitFor(
    async () => {
      const electionPackageDuringExport = await apiClient.getElectionPackage({
        electionId,
      });
      expect(electionPackageDuringExport.task?.progress).toEqual({
        label: 'Test progress message',
        progress: 2,
        total: 10,
      });
    },
    { interval: 500, retries: 3 }
  );

  // Complete the task
  emitProgress('Test progress message', 10, 10);
  deferredRenderResult.resolve({
    ballotPaths: props.map(() => makeTemporaryFile()),
    electionDefinition: baseElectionDefinition,
  });
  await taskPromise;

  const electionPackageAfterExport = await apiClient.getElectionPackage({
    electionId,
  });
  expect(electionPackageAfterExport).toEqual<MainExportTaskMetadata>({
    task: {
      completedAt: expect.any(Date),
      createdAt: expect.any(Date),
      id: taskId,
      payload: expectedPayload,
      startedAt: expect.any(Date),
      taskName: 'generate_election_package',
      progress: {
        label: 'Test progress message',
        progress: 10,
        total: 10,
      },
    },
    electionPackageUrl: expect.stringMatching(
      regexElectionPackageZip(nonVxJurisdiction)
    ),
    officialBallotsUrl: expect.stringMatching(
      regexOfficialBallotsZip(nonVxJurisdiction)
    ),
    sampleBallotsUrl: expect.stringMatching(
      regexSampleBallotsZip(nonVxJurisdiction)
    ),
    testBallotsUrl: expect.stringMatching(
      regexTestBallotsZip(nonVxJurisdiction)
    ),
  });

  // Check that the correct package was returned by the files API endpoint
  const electionPackageUrl = `${baseUrl}${electionPackageAfterExport.electionPackageUrl}`;
  const electionPackageFileName = path.basename(electionPackageUrl);
  const electionHashes = electionPackageFileName.match(
    /^election-package-(.+)\.zip$/
  )![1];
  expect(electionPackageAfterExport.electionPackageUrl).toContain(
    electionHashes
  );

  // Check that a bad URL returns an error
  await suppressingConsoleOutput(async () => {
    const badUrlResponse = await fetch(`${electionPackageUrl}whoops`);
    expect(badUrlResponse.status).toEqual(500);
    expect(await badUrlResponse.json()).toEqual({
      message: '{"type":"undefined-body"}',
    });
  });

  // Check that other jurisdiction users can't access the package
  await suppressingConsoleOutput(async () => {
    auth0.setLoggedInUser(anotherNonVxUser);
    const otherJurisdictionResponse = await fetch(electionPackageUrl);
    expect(otherJurisdictionResponse.status).toEqual(400);
    expect(await otherJurisdictionResponse.json()).toEqual({
      message: 'auth:forbidden',
    });
  });

  // Check that initiating an export after a prior has completed does trigger a new background task
  auth0.setLoggedInUser(nonVxUser);
  await apiClient.exportElectionPackage({
    electionId,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: true,
    shouldExportTestBallots: true,
  });
  const electionPackageAfterInitiatingSecondExport =
    await apiClient.getElectionPackage({ electionId });
  expect(
    electionPackageAfterInitiatingSecondExport
  ).toEqual<MainExportTaskMetadata>({
    task: {
      createdAt: expect.any(Date),
      id: expect.any(String),
      payload: expectedPayload,
      taskName: 'generate_election_package',
    },
    // Previous URL should be cleared out when a new task is started:
    electionPackageUrl: undefined,
  });
  const secondTaskId = assertDefined(
    electionPackageAfterInitiatingSecondExport.task
  ).id;
  expect(secondTaskId).not.toEqual(taskId);

  await suppressingConsoleOutput(async () => {
    // Check permissions
    auth0.setLoggedInUser(anotherNonVxUser);
    await expect(apiClient.getElectionPackage({ electionId })).rejects.toThrow(
      'auth:forbidden'
    );
    await expect(
      apiClient.exportElectionPackage({
        electionId,
        electionSerializationFormat: 'vxf',
        shouldExportAudio: false,
        shouldExportSampleBallots: true,
        shouldExportTestBallots: true,
      })
    ).rejects.toThrow('auth:forbidden');
  });
});

test('Election package and ballots export', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  // Without mocking all the translations some ballot styles for non-English languages don't fit on a letter
  // page for this election. To get around this we use legal paper size for the purposes of this test.
  const electionWithLegalPaper: Election = {
    ...baseElectionDefinition.election,
    ballotLayout: {
      ...baseElectionDefinition.election.ballotLayout,
      paperSize: HmpbBallotPaperSize.Legal,
    },
  };
  const mockSystemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    precinctScanAdjudicationReasons: [
      AdjudicationReason.Overvote,
      AdjudicationReason.UnmarkedWriteIn,
    ],
    shouldTransliterateCandidateNames: true,
  };
  const { apiClient, workspace, fileStorageClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id',
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: JSON.stringify(electionWithLegalPaper),
      },
    })
  ).unsafeUnwrap();
  await apiClient.updateSystemSettings({
    electionId,
    systemSettings: mockSystemSettings,
  });
  const electionInfo = await apiClient.getElectionInfo({ electionId });

  // Add a split precinct before listing precincts so it's included in the
  // exported election definition's precincts list and in the expectedElection
  // assertion below.
  const districts = await apiClient.listDistricts({ electionId });
  const firstDistrictId = assertDefined(districts[0]).id;
  const splitPrecinctId = 'split-precinct-export-test';
  const splitFirstId = 'split-a-export-test';
  const splitSecondId = 'split-b-export-test';
  const splitPrecinct: PrecinctWithSplits = {
    id: splitPrecinctId,
    name: 'Split Precinct Export Test',
    splits: [
      { id: splitFirstId, name: 'Split A', districtIds: [firstDistrictId] },
      { id: splitSecondId, name: 'Split B', districtIds: [] },
    ],
  };
  (
    await apiClient.createPrecinct({
      electionId,
      newPrecinct: splitPrecinct,
    })
  ).unsafeUnwrap();

  // Re-fetch ballot styles after creating the split precinct since the new
  // precinct gets assigned to an existing ballot style.
  const ballotStyles = await apiClient.listBallotStyles({ electionId });

  // Set registered voter counts on non-split precincts before export.
  // The split precinct gets its counts set separately below since it requires
  // per-split counts rather than a single number.
  const precincts = await apiClient.listPrecincts({ electionId });
  for (const precinct of precincts) {
    if (!hasSplits(precinct)) {
      (
        await apiClient.updatePrecinct({
          electionId,
          updatedPrecinct: precinct,
          registeredVoterCounts: 1000,
        })
      ).unsafeUnwrap();
    }
  }
  (
    await apiClient.updatePrecinct({
      electionId,
      updatedPrecinct: splitPrecinct,
      registeredVoterCounts: {
        splits: { [splitFirstId]: 500, [splitSecondId]: 300 },
      },
    })
  ).unsafeUnwrap();

  const expectedRegisteredVoterCounts: ElectionRegisteredVoterCounts = {
    ...Object.fromEntries(
      precincts.filter((p) => !hasSplits(p)).map((p) => [p.id, 1000])
    ),
    [splitPrecinctId]: {
      splits: { [splitFirstId]: 500, [splitSecondId]: 300 },
    },
  };

  const exportMeta = await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: true,
    shouldExportSampleBallots: true,
    shouldExportTestBallots: true,
    numAuditIdBallots: undefined,
  });

  const electionPackageContents = getExportedFile({
    storage: fileStorageClient,
    jurisdictionId: nonVxJurisdiction.id,
    url: exportMeta.electionPackageUrl,
  });

  const { electionPackage, electionPackageHash } = (
    await readElectionPackageFromBuffer(electionPackageContents)
  ).unsafeUnwrap();

  const {
    electionDefinition,
    metadata,
    registeredVoterCounts,
    systemSettings,
    uiStringAudioIds,
    uiStrings,
  } = electionPackage;
  const uiStringAudioClips = await readAudioClipsFromElectionPackage(
    electionPackageContents
  );
  const ballots = await readBallotsFromElectionPackage(electionPackageContents);
  assert(metadata !== undefined);
  assert(systemSettings !== undefined);

  expect(registeredVoterCounts).toEqual(expectedRegisteredVoterCounts);
  assert(uiStringAudioIds !== undefined);
  assert(uiStrings !== undefined);

  const packageUrl = assertDefined(exportMeta.electionPackageUrl);
  const [, ballotHashFromFileName, electionPackageHashFromFileName] =
    packageUrl.match(ELECTION_PACKAGE_FILE_NAME_REGEX)!;
  expect(electionPackageHashFromFileName).toEqual(
    formatElectionPackageHash(electionPackageHash)
  );
  expect(ballotHashFromFileName).toEqual(
    formatBallotHash(electionDefinition.ballotHash)
  );
  // The election should be retrievable from the ballot hash.
  const exportedElectionId = await workspace.store.getElectionIdFromBallotHash(
    electionDefinition.ballotHash
  );
  expect(exportedElectionId).toBeDefined();
  expect(exportedElectionId).toEqual(electionInfo.electionId);

  // The election is not retrievable from the election package hash, since we don't store that
  const undefinedElectionId =
    await workspace.store.getElectionIdFromBallotHash(electionPackageHash);
  expect(undefinedElectionId).toBeUndefined();

  //
  // Check metadata
  //

  expect(metadata.version).toEqual('latest');

  //
  // Check election definition
  //
  const expectedElectionWithoutBallotStrings: Election = {
    ...electionWithLegalPaper,
    id: electionId,
    jurisdiction: {
      ...electionWithLegalPaper.jurisdiction,
      id: `${electionId}-county`,
    },
    // Ballot styles are generated in the app, ignoring the ones in the inputted election
    // definition
    ballotStyles,

    // Include entities with IDs generated by VxHub
    districts: await apiClient.listDistricts({ electionId }),
    // This is an editing state, so polling places are exported as-is with no
    // Central Scanning place auto-generated.
    pollingPlaces: await apiClient.listPollingPlaces({ electionId }),
    precincts,
    parties: await apiClient.listParties({ electionId }),
    contests: await apiClient.listContests({ electionId }),

    additionalHashInput: {
      precinctSplitSeals: expect.any(Object),
      precinctSplitSignatureImages: expect.any(Object),
    },
  };
  const expectedElection: Election = {
    ...expectedElectionWithoutBallotStrings,
    // Translated strings for election content and HMPB content should have been
    // added to the election. so they can be included in the ballot hash.
    ballotStrings: expectedEnglishBallotStrings({
      ...expectedElectionWithoutBallotStrings,
      ballotStyles,
    }),
  };

  expect(electionDefinition.election).toEqual({
    ...expectedElection,
    // The base election's ballot styles should have been extended with ballot
    // positions. The correctness of the positions is tested by
    // libs/ballot-interpreter tests.
    ballotStyles: expectedElection.ballotStyles.map((ballotStyle) => ({
      ...ballotStyle,
      ballotPositions: expect.any(Array),
    })),
  });

  // Assert that an indented election.json was exported.
  // (Should only be compact when the `splitElectionDefinition` setting is on).
  const { electionData } = electionDefinition;
  expect(electionData).toContain('\n');

  //
  // Check system settings
  //

  expect(systemSettings).toEqual(mockSystemSettings);

  //
  // Check UI strings
  //

  const allBallotLanguages = electionInfo.languageCodes;
  for (const languageCode of allBallotLanguages) {
    expect(countObjectLeaves(uiStrings[languageCode] ?? {})).toBeGreaterThan(
      // A number high enough to give us confidence that we've exported both app and election strings
      200
    );
  }

  for (const electionStringKey of Object.values(ElectionStringKey)) {
    // The current election definition doesn't include any yes-no contests,
    // contest terms, precinct splits, or candidate designations
    if (
      electionStringKey === ElectionStringKey.CANDIDATE_DESIGNATION ||
      electionStringKey === ElectionStringKey.CONTEST_DESCRIPTION ||
      electionStringKey === ElectionStringKey.CONTEST_OPTION_LABEL ||
      electionStringKey === ElectionStringKey.CONTEST_TERM ||
      electionStringKey === ElectionStringKey.PRECINCT_SPLIT_NAME
    ) {
      continue;
    }

    expect(
      assertDefined(uiStrings[LanguageCode.ENGLISH])[electionStringKey]
    ).toBeDefined();
  }

  const stringsInEnglish: Array<{
    stringKey: string | [string, string];
    stringInEnglish: string;
  }> = [];
  forEachUiString(
    uiStrings,
    ({ languageCode, stringKey, stringInLanguage }) => {
      if (languageCode === LanguageCode.ENGLISH) {
        stringsInEnglish.push({ stringKey, stringInEnglish: stringInLanguage });
      }
    }
  );

  // Verify that strings were translated as expected
  for (const languageCode of allBallotLanguages) {
    if (languageCode === LanguageCode.ENGLISH) {
      continue;
    }

    for (const { stringKey, stringInEnglish } of stringsInEnglish) {
      const stringInLanguage = [languageCode, stringKey]
        .flat()
        .reduce<unknown>(
          (node, key) => (node as Record<string, unknown> | undefined)?.[key],
          uiStrings
        );
      if (
        Array.isArray(stringKey) &&
        stringKey[0] === ElectionStringKey.BALLOT_STYLE_ID
      ) {
        expect(stringInLanguage).not.toBeDefined();
      } else if (
        Array.isArray(stringKey) &&
        stringKey[0] === ElectionStringKey.CANDIDATE_NAME
      ) {
        if (NEEDS_TRANSLITERATED_NAMES[languageCode]) {
          expect(stringInLanguage).toEqual(
            mockCloudTranslatedText(stringInEnglish, languageCode)
          );
        } else {
          expect(stringInLanguage).not.toBeDefined();
        }
      } else if (stringKey === ElectionStringKey.ELECTION_DATE) {
        expect(stringInLanguage).toBeDefined();
      } else if (stringKey === ElectionStringKey.BALLOT_LANGUAGE) {
        expect(stringInLanguage).toBeDefined();
      } else {
        expect(stringInLanguage).toBeDefined();
        expect(stringInLanguage).toEqual(
          mockCloudTranslatedText(stringInEnglish, languageCode)
        );
      }
    }
  }

  //
  // Check uiStringAudioIds.json
  //
  expect(countObjectLeaves(uiStringAudioIds)).toEqual(
    countObjectLeaves(uiStrings) -
      Object.keys(hmpbStringsCatalog).length * allBallotLanguages.length
  );

  //
  // Check audioClips.jsonl
  //
  const audioIds: Set<string> = new Set(
    getObjectLeaves(uiStringAudioIds)
      .flat()
      .filter((audioId): audioId is string => {
        assert(typeof audioId === 'string');
        return !(audioId.startsWith('{{') && audioId.endsWith('}}'));
      })
  );
  const audioIdsInAudioClipsFile = new Set(
    uiStringAudioClips.map(({ id }) => id)
  );
  expect(audioIdsInAudioClipsFile.size).toEqual(audioIds.size);
  for (const audioId of audioIds) {
    expect(audioIdsInAudioClipsFile.has(audioId)).toEqual(true);
  }

  for (const { dataBase64 } of uiStringAudioClips) {
    expect(
      isMockCloudSynthesizedSpeech(
        Buffer.from(dataBase64, 'base64').toString('utf-8')
      )
    ).toEqual(true);
  }

  //
  // Check ballots ZIP
  //

  const calibrationSheetName = 'VxScan-calibration-sheet.pdf';

  for (const [zipUrl, prefix, additionalFiles] of [
    [exportMeta.officialBallotsUrl, 'official', [calibrationSheetName]],
    [exportMeta.sampleBallotsUrl, 'sample', []],
    [exportMeta.testBallotsUrl, 'test', [calibrationSheetName]],
  ] as const) {
    const contents = getExportedFile({
      storage: fileStorageClient,
      jurisdictionId: nonVxJurisdiction.id,
      url: zipUrl,
    });

    const zip = await JsZip.loadAsync(new Uint8Array(contents));

    const expectedFileNames = [
      ...ballotStyles
        .flatMap(({ id, precincts: ballotStylePrecincts }) =>
          ballotStylePrecincts.map((precinctId) => ({
            ballotStyleId: id,
            precinctId,
          }))
        )
        .flatMap(({ ballotStyleId, precinctId }) => {
          const precinctName = find(
            electionDefinition.election.precincts,
            (p) => p.id === precinctId
          ).name.replaceAll(' ', '_');

          const suffix = `ballot-${precinctName}-${ballotStyleId}.pdf`;

          return [
            `${prefix}-absentee-${suffix}`,
            `${prefix}-precinct-${suffix}`,
          ];
        }),
      ...additionalFiles,
    ].sort();

    expect(Object.keys(zip.files).sort()).toEqual(expectedFileNames);

    for (const file of Object.values(zip.files)) {
      expect(await file.async('text')).toContain('%PDF');
    }
  }

  //
  // Check ballots.jsonl
  //
  const expectedEntries = ballotStyles
    .flatMap(({ id, precincts: ballotStylePrecincts }) =>
      ballotStylePrecincts.map((precinctId) => ({
        ballotStyleId: id,
        precinctId,
      }))
    )
    .flatMap(({ ballotStyleId, precinctId }) =>
      Object.values(['precinct', 'absentee']).flatMap((ballotType) =>
        BALLOT_MODES.map((ballotMode) => ({
          ballotStyleId,
          precinctId,
          ballotType,
          ballotMode,
        }))
      )
    );

  // Check that we have the expected number of entries
  expect(ballots).toHaveLength(expectedEntries.length);

  // Check each expected entry exists with base64 encoded data
  for (const expected of expectedEntries) {
    const matchingEntry = ballots.find(
      (entry) =>
        entry.ballotStyleId === expected.ballotStyleId &&
        entry.precinctId === expected.precinctId &&
        entry.ballotType === expected.ballotType &&
        entry.ballotMode === expected.ballotMode
    );

    assert(
      matchingEntry,
      `Couldn't find match for ballot entry: ${JSON.stringify(expected)}`
    );
    expect(matchingEntry.encodedBallot).toBeTruthy();
    expect(typeof matchingEntry.encodedBallot).toEqual('string');
  }

  const ballotCombos: Array<[BallotType, BallotMode]> = [
    [BallotType.Precinct, 'official'],
    [BallotType.Precinct, 'test'],
    [BallotType.Precinct, 'sample'],
    [BallotType.Absentee, 'official'],
    [BallotType.Absentee, 'test'],
    [BallotType.Absentee, 'sample'],
  ];
  const expectedBallotProps = expectedElection.ballotStyles.flatMap(
    (ballotStyle) =>
      ballotStyle.precincts.flatMap((precinctId) =>
        ballotCombos.map(([ballotType, ballotMode]): BaseBallotProps => ({
          election: expectedElection,
          ballotStyleId: ballotStyle.id,
          precinctId,
          ballotType,
          ballotMode,
          compact: false,
        }))
      )
  );
  expect(
    renderAllBallotPdfsAndCreateElectionDefinition
  ).toHaveBeenCalledExactlyOnceWith(
    expect.any(Object), // Renderer
    ballotTemplates.VxDefaultBallot,
    expectedBallotProps,
    { format: 'vxf', version: LATEST_SOFTWARE_VERSION },
    await apiClient.getSystemSettings({ electionId }),
    ANY_SCRATCH_DIR,
    expect.any(Function) // emitProgress callback
  );
});

test('export - polling places auto-generated when EDIT_POLLING_PLACES === false', async () => {
  const baseElection =
    electionFamousNames2021Fixtures.readElectionDefinition().election;

  const inElection: Election = {
    ...baseElection,
    ballotLayout: {
      ...baseElection.ballotLayout,
      paperSize: HmpbBallotPaperSize.Legal,
    },
    signature: { caption: 'foo', image: 'bar' },
  };

  const { apiClient, workspace, fileStorageClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  const user = nonVxUser;
  const jurisdiction = nonVxUser.jurisdictions[0]!;
  const stateFeatures = getStateFeaturesConfig(jurisdiction);
  expect(stateFeatures.EDIT_POLLING_PLACES).toBeFalsy();

  auth0.setLoggedInUser(user);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id',
      jurisdictionId: jurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: JSON.stringify(inElection),
      },
    })
  ).unsafeUnwrap();

  const exportMeta = await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: true,
    shouldExportSampleBallots: true,
    shouldExportTestBallots: true,
    numAuditIdBallots: undefined,
  });

  const electionPackageContents = getExportedFile({
    storage: fileStorageClient,
    jurisdictionId: jurisdiction.id,
    url: exportMeta.electionPackageUrl,
  });

  const { electionPackage } = (
    await readElectionPackageFromBuffer(electionPackageContents)
  ).unsafeUnwrap();

  const outElection = electionPackage.electionDefinition.election;

  const precincts = await apiClient.listPrecincts({ electionId });
  const expectedPlaces = pollingPlacesGenerateFromPrecincts(
    precincts,
    'election_day',
    // Should be consistent to guarantee a consistent ballot hash:
    (p) => `${p.id}-polling-place`
  );
  expect(outElection.pollingPlaces).toEqual(expectedPlaces);

  const exportedPlaces = assertDefined(outElection.pollingPlaces);
  const exportedPlaceNamesEn =
    outElection.ballotStrings[LanguageCode.ENGLISH]?.[
      ElectionStringKey.POLLING_PLACE_NAME
    ];
  expect(exportedPlaceNamesEn).toEqual(
    Object.fromEntries(exportedPlaces.map(({ id, name }) => [id, name]))
  );
});

test('export omits optional ballots if not enabled', async () => {
  const { apiClient, workspace, fileStorageClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nonVxUser);

  const baseElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();

  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id',
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: JSON.stringify(baseElectionDefinition.election),
      },
    })
  ).unsafeUnwrap();

  await apiClient.updateSystemSettings({
    electionId,
    systemSettings: DEFAULT_SYSTEM_SETTINGS,
  });

  const ballotStyles = await apiClient.listBallotStyles({ electionId });

  const exportMeta = await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: false,
    shouldExportTestBallots: false,
    numAuditIdBallots: undefined,
  });

  const electionZip = getExportedFile({
    storage: fileStorageClient,
    jurisdictionId: nonVxJurisdiction.id,
    url: exportMeta.electionPackageUrl,
  });

  const { electionPackage } = (
    await readElectionPackageFromBuffer(electionZip)
  ).unsafeUnwrap();

  const { electionDefinition } = electionPackage;
  const ballots = await readBallotsFromElectionPackage(electionZip);

  expect(exportMeta.sampleBallotsUrl).toBeUndefined();
  expect(exportMeta.testBallotsUrl).toBeUndefined();
  expect(exportMeta.officialBallotsUrl).toMatch(
    regexOfficialBallotsZip(nonVxJurisdiction)
  );

  const ballotTypes = ['precinct', 'absentee'];
  let expectedNumBallots = 0;
  for (const bs of ballotStyles) {
    expectedNumBallots += bs.precincts.length * ballotTypes.length;
  }

  expect(ballots).toHaveLength(expectedNumBallots);
  for (const ballot of ballots) {
    expect(ballot.ballotMode).toEqual<BallotMode>('official');
  }

  //
  // Verify renderer props
  //

  const ballotCombos: Array<[BallotType, BallotMode]> = [
    [BallotType.Precinct, 'official'],
    [BallotType.Absentee, 'official'],
  ];

  const { election } = electionDefinition;
  const expectedBallotProps = election.ballotStyles.flatMap((ballotStyle) =>
    ballotStyle.precincts.flatMap((precinctId) =>
      ballotCombos.map(([ballotType, ballotMode]): BaseBallotProps => ({
        election: {
          ...election,
          ballotStyles: election.ballotStyles.map(
            ({ ballotPositions: _ballotPositions, ...rest }) => rest
          ),
        },
        ballotStyleId: ballotStyle.id,
        precinctId,
        ballotType,
        ballotMode,
        compact: false,
      }))
    )
  );
  expect(
    renderAllBallotPdfsAndCreateElectionDefinition
  ).toHaveBeenCalledExactlyOnceWith(
    expect.any(Object), // Renderer
    ballotTemplates.VxDefaultBallot,
    expectedBallotProps,
    { format: 'vxf', version: LATEST_SOFTWARE_VERSION },
    await apiClient.getSystemSettings({ electionId }),
    ANY_SCRATCH_DIR,
    expect.any(Function) // emitProgress callback
  );
});

test('Election package export with VxDefaultBallot drops signature field', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { apiClient, workspace, fileStorageClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id',
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: baseElectionDefinition.electionData,
      },
    })
  ).unsafeUnwrap();

  // Set a signature in the election info
  (
    await apiClient.updateElectionInfo({
      electionId,
      title: baseElectionDefinition.election.title,
      jurisdictionName: baseElectionDefinition.election.jurisdiction.name,
      state: baseElectionDefinition.election.state,
      seal: baseElectionDefinition.election.seal,
      type: baseElectionDefinition.election.type,
      isMiCombinedBallotPrimary: false,
      date: baseElectionDefinition.election.date,
      languageCodes: [LanguageCode.ENGLISH],
      signatureImage: 'test-signature-image',
      signatureCaption: 'Test Signature Caption',
    })
  ).unsafeUnwrap();

  // Ensure we're using VxDefaultBallot template
  await apiClient.setBallotTemplate({
    electionId,
    ballotTemplateId: 'VxDefaultBallot',
  });

  const exportMeta = await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: false,
    shouldExportTestBallots: true,
    numAuditIdBallots: undefined,
  });

  const electionPackageContents = getExportedFile({
    storage: fileStorageClient,
    jurisdictionId: nonVxJurisdiction.id,
    url: exportMeta.electionPackageUrl,
  });

  const { electionPackage } = (
    await readElectionPackageFromBuffer(electionPackageContents)
  ).unsafeUnwrap();

  // Check that the signature field is undefined in the exported election
  expect(electionPackage.electionDefinition.election.signature).toBeUndefined();
});

test('export - with `splitElectionDefinition` setting on', async () => {
  const fixtures = electionGridLayoutNewHampshireTestBallotFixtures;
  const electionData = fixtures.electionJson.asText();

  const { apiClient, workspace, fileStorageClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nonVxUser);

  const newElectionRes = await apiClient.loadElection({
    newId: 'new-election-id',
    jurisdictionId: nonVxJurisdiction.id,
    upload: {
      format: 'vxf',
      electionFileContents: electionData,
    },
  });

  const electionId = newElectionRes.unsafeUnwrap();
  const { election } = await workspace.store.getElection(electionId);
  const { ballotStyles } = election;

  await apiClient.updateSystemSettings({
    electionId,
    systemSettings: {
      ...DEFAULT_SYSTEM_SETTINGS,
      splitElectionDefinition: true,
    },
  });

  const exportMeta = await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: false,
    shouldExportTestBallots: true,
    numAuditIdBallots: undefined,
  });

  const pkg = getExportedFile({
    storage: fileStorageClient,
    jurisdictionId: nonVxJurisdiction.id,
    url: exportMeta.electionPackageUrl,
  });

  const Entry = ElectionPackageFileName;
  const zip = await openElectionPackageZipBuffer(pkg);
  const pkgPositionsJsonl = await zip.readEntryText(Entry.BALLOT_POSITIONS);
  const pkgOrderingsJsonl = await zip.readEntryText(Entry.CANDIDATE_ORDERINGS);

  const parsedPositions = pkgPositionsJsonl
    .trim()
    .split('\n')
    .map((l) => safeParseJson(l, BallotPositionsSchema).unsafeUnwrap());

  expect(parsedPositions).toHaveLength(ballotStyles.length);

  for (let i = 0; i < parsedPositions.length; i += 1) {
    expect(parsedPositions[i]?.ballotStyleId).toEqual(ballotStyles[i]?.id);
  }

  const parsedOrderings = pkgOrderingsJsonl
    .trim()
    .split('\n')
    .map((l) => unsafeParseJson(l, BallotCandidateOrderingsSchema));

  expect(parsedOrderings).toHaveLength(ballotStyles.length);

  for (let i = 0; i < parsedOrderings.length; i += 1) {
    expect(parsedOrderings[i]?.ballotStyleId).toEqual(ballotStyles[i]?.id);
  }

  // Expect a compact election.json, to reduce bloat from candidate orderings.
  const electionJson = await zip.readEntryText(Entry.ELECTION);
  expect(electionJson).not.toContain('\n');
});

test('Election package generation is deterministic', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { apiClient, workspace, fileStorageClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id',
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: baseElectionDefinition.electionData,
      },
    })
  ).unsafeUnwrap();

  const exportMeta1 = await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: false,
    shouldExportTestBallots: false,
    numAuditIdBallots: undefined,
  });
  const contents1 = getExportedFile({
    storage: fileStorageClient,
    jurisdictionId: nonVxJurisdiction.id,
    url: exportMeta1.electionPackageUrl,
  });

  const exportMeta2 = await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: false,
    shouldExportTestBallots: false,
    numAuditIdBallots: undefined,
  });
  const contents2 = getExportedFile({
    storage: fileStorageClient,
    jurisdictionId: nonVxJurisdiction.id,
    url: exportMeta2.electionPackageUrl,
  });

  expect(contents1.equals(contents2)).toEqual(true);
});

test('v4.0 elections', async () => {
  const v4p0Jurisdiction: Jurisdiction = {
    ...nonVxJurisdiction,
    softwareVersion: 'v4.0',
  };
  const v4p0User: JurisdictionUser = {
    ...nonVxUser,
    jurisdictions: [v4p0Jurisdiction],
  };

  const baseElectionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { apiClient, workspace, fileStorageClient, auth0 } = await setupApp({
    organizations,
    jurisdictions: [v4p0Jurisdiction],
    users: [v4p0User],
  });

  // Load election can import a v4.0 election
  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id',
      jurisdictionId: v4p0Jurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: JSON.stringify(
          convertLatestElectionToV4p0(baseElectionDefinition.election)
        ),
      },
    })
  ).unsafeUnwrap();

  const exportMeta = await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: false,
    shouldExportTestBallots: false,
    numAuditIdBallots: undefined,
  });

  const electionPackageContents = getExportedFile({
    storage: fileStorageClient,
    jurisdictionId: v4p0Jurisdiction.id,
    url: exportMeta.electionPackageUrl,
  });

  const zipFile = await openZip(electionPackageContents);
  const entries = getEntries(zipFile);
  const electionEntry = getFileByName(
    entries,
    ElectionPackageFileName.ELECTION
  );
  const electionData = await readTextEntry(electionEntry);
  safeParseElectionV4p0(electionData).unsafeUnwrap();

  // The official ballots in the election package must be rendered with v4.0 QR
  // metadata so deployed v4.0 scanners can read them.
  const officialBallotRenderCalls = vi.mocked(
    renderAllBallotPdfsAndCreateElectionDefinition
  ).mock.calls;
  expect(officialBallotRenderCalls.length).toBeGreaterThan(0);
  for (const call of officialBallotRenderCalls) {
    expect(call[3].version).toEqual('v4.0');
  }

  // Test decks aren't supported for v4.0 jurisdictions
  await apiClient.exportTestDecks({
    electionId,
    electionSerializationFormat: 'vxf',
  });
  await processNextBackgroundTaskIfAny({ fileStorageClient, workspace });
  const testDecks = await apiClient.getTestDecks({ electionId });
  expect(testDecks.url).toBeUndefined();
  expect(testDecks.task?.error).toContain(
    'Test deck generation is not supported for software version v4.0'
  );
  expect(vi.mocked(createPrecinctTestDeck)).not.toHaveBeenCalled();

  // Live reports should be able to parse the saved exported election
  // definition, even though it's a previous version
  (await apiClient.getLiveReportsSummary({ electionId })).unsafeUnwrap();
});

test('export ballots with audit IDs', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { apiClient, workspace, fileStorageClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id',
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: baseElectionDefinition.electionData,
      },
    })
  ).unsafeUnwrap();

  const numAuditIdBallots = 3;
  const exportMeta = await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: false,
    shouldExportTestBallots: true,
    numAuditIdBallots,
  });

  const ballotsContents = getExportedFile({
    storage: fileStorageClient,
    jurisdictionId: nonVxJurisdiction.id,
    url: exportMeta.officialBallotsUrl,
  });

  const zip = await JsZip.loadAsync(new Uint8Array(ballotsContents));
  expect(Object.keys(zip.files)).toHaveLength(numAuditIdBallots + 1);
  expect(Object.keys(zip.files).sort()).toEqual([
    'VxScan-calibration-sheet.pdf',
    'official-precinct-ballot-East_Lincoln-1_en-1.pdf',
    'official-precinct-ballot-East_Lincoln-1_en-2.pdf',
    'official-precinct-ballot-East_Lincoln-1_en-3.pdf',
  ]);
  expect(renderAllBallotPdfsAndCreateElectionDefinition).toHaveBeenCalledTimes(
    1
  );
  const ballotStyles = await apiClient.listBallotStyles({ electionId });
  const expectedBallotProps = range(1, numAuditIdBallots + 1).map(
    (i): BaseBallotProps => ({
      ballotStyleId: ballotStyles[0]!.id,
      precinctId: ballotStyles[0]!.precincts[0]!,
      ballotType: BallotType.Precinct,
      ballotMode: 'official',
      election: expect.any(Object),
      ballotAuditId: String(i),
      compact: false,
    })
  );
  expect(renderAllBallotPdfsAndCreateElectionDefinition).toHaveBeenCalledWith(
    expect.any(Object), // Renderer
    ballotTemplates.VxDefaultBallot,
    expectedBallotProps,
    { format: 'vxf', version: LATEST_SOFTWARE_VERSION },
    {
      ...(await apiClient.getSystemSettings({ electionId })),
      precinctScanEnableBallotAuditIds: true,
    },
    ANY_SCRATCH_DIR,
    expect.any(Function) // emitProgress callback
  );
});

function regexElectionPackageZip(jurisdiction: Jurisdiction) {
  return new RegExp(`${jurisdiction.id}/election-package`);
}

function regexOfficialBallotsZip(jurisdiction: Jurisdiction) {
  return new RegExp(`${jurisdiction.id}/official-ballots`);
}

function regexSampleBallotsZip(jurisdiction: Jurisdiction) {
  return new RegExp(`${jurisdiction.id}/sample-ballots`);
}

function regexTestBallotsZip(jurisdiction: Jurisdiction) {
  return new RegExp(`${jurisdiction.id}/test-ballots`);
}
