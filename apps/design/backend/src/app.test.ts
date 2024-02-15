import { Buffer } from 'buffer';
import JsZip from 'jszip';
import get from 'lodash.get';
import { assert, assertDefined } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import {
  DEFAULT_LAYOUT_OPTIONS,
  layOutAllBallotStyles,
  LayoutOptions,
} from '@votingworks/hmpb-layout';
import {
  AdjudicationReason,
  AnyContest,
  BallotType,
  CandidateContest,
  Contests,
  DEFAULT_SYSTEM_SETTINGS,
  District,
  DistrictId,
  Election,
  ElectionStringKey,
  ElectionType,
  LanguageCode,
  Parties,
  Party,
  PartyId,
  SystemSettings,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getBallotStylesByPrecinctId,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { readElectionPackageFromFile } from '@votingworks/backend';
import { countObjectLeaves, getObjectLeaves } from '@votingworks/test-utils';
import {
  ApiClient,
  exportElectionPackage,
  isMockCloudSynthesizedSpeech,
  mockCloudTranslatedText,
  processNextBackgroundTaskIfAny,
  testSetupHelpers,
} from '../test/helpers';
import { hasSplits, Precinct } from './store';
import { FULL_TEST_DECK_TALLY_REPORT_FILE_NAME } from './test_decks';
import { forEachUiString } from './language_and_audio';

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
  };
});

const { setupApp, cleanup } = testSetupHelpers();

afterAll(cleanup);

beforeEach(() => {
  mockFeatureFlagger.resetFeatureFlags();
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_CLOUD_TRANSLATION_AND_SPEECH_SYNTHESIS
  );
});

test('CRUD elections', async () => {
  const { apiClient } = setupApp();
  expect(await apiClient.listElections()).toEqual([]);

  const electionId = (
    await apiClient.createElection({ electionData: undefined })
  ).unsafeUnwrap();
  expect(electionId).toEqual('1');

  const election = await apiClient.getElection({ electionId });
  // New elections should be blank
  expect(election).toEqual({
    id: '1',
    election: {
      ballotLayout: {
        metadataEncoding: 'qr-code',
        paperSize: 'letter',
      },
      ballotStyles: [],
      contests: [],
      county: {
        id: '',
        name: '',
      },
      date: '',
      districts: [],
      parties: [],
      precincts: [],
      seal: '',
      state: '',
      title: '',
      type: 'general',
    },
    systemSettings: DEFAULT_SYSTEM_SETTINGS,
    ballotStyles: [],
    precincts: [],
    layoutOptions: DEFAULT_LAYOUT_OPTIONS,
    nhCustomContent: {},
    createdAt: expect.any(String),
  });

  expect(await apiClient.listElections()).toEqual([election]);

  const election2Definition =
    electionFamousNames2021Fixtures.electionDefinition;
  const electionId2 = (
    await apiClient.createElection({
      electionData: election2Definition.electionData,
    })
  ).unsafeUnwrap();
  expect(electionId2).toEqual('2');

  const election2 = await apiClient.getElection({ electionId: electionId2 });
  expect(election2).toMatchObject({
    id: '2',
    election: {
      ...election2Definition.election,
      ballotStyles: [
        {
          id: 'ballot-style-1',
          precincts: election2Definition.election.precincts.map(
            (precinct) => precinct.id
          ),
        },
      ],
    },
    systemSettings: DEFAULT_SYSTEM_SETTINGS,
    // TODO test that ballot styles/precincts are correct
    ballotStyles: [
      {
        id: 'ballot-style-1',
        precinctsOrSplits: election2Definition.election.precincts.map(
          (precinct) => ({ precinctId: precinct.id })
        ),
        districtIds: ['district-1'],
      },
    ],
    precincts: election2Definition.election.precincts.map((precinct) => ({
      id: precinct.id,
      name: precinct.name,
      districtIds: ['district-1'],
    })),
    nhCustomContent: {},
    createdAt: expect.any(String),
  });

  expect(await apiClient.listElections()).toEqual([election, election2]);

  const updatedElection: Election = {
    ...election.election,
    title: 'Updated Election',
    type: 'primary',
  };

  await apiClient.updateElection({
    electionId,
    election: updatedElection,
  });

  expect(await apiClient.getElection({ electionId })).toEqual({
    ...election,
    election: updatedElection,
  });

  await apiClient.deleteElection({ electionId });

  expect(await apiClient.listElections()).toEqual([election2]);
});

test('Updating contests with candidate rotation', async () => {
  const { apiClient } = setupApp();
  const electionId = (
    await apiClient.createElection({
      electionData:
        electionFamousNames2021Fixtures.electionDefinition.electionData,
    })
  ).unsafeUnwrap();
  const electionRecord = await apiClient.getElection({ electionId });
  const contest = electionRecord.election.contests.find(
    (c): c is CandidateContest =>
      c.type === 'candidate' && c.candidates.length > 2
  )!;
  expect(contest.candidates.map((c) => c.name)).toMatchInlineSnapshot(`
[
  "Winston Churchill",
  "Oprah Winfrey",
  "Louis Armstrong",
]
`);

  // Update with no changes just to trigger candidate rotation
  await apiClient.updateElection({
    electionId,
    election: electionRecord.election,
  });

  const updatedElectionRecord = await apiClient.getElection({ electionId });
  const updatedContest = updatedElectionRecord.election.contests.find(
    (c): c is CandidateContest => c.id === contest.id
  )!;
  expect(updatedContest.candidates.map((c) => c.name)).toMatchInlineSnapshot(`
[
  "Louis Armstrong",
  "Winston Churchill",
  "Oprah Winfrey",
]
`);

  // Rotation logic is tested in candidate_rotation.test.ts
  // Here we just want to make sure that rotation occurred.
  expect(updatedContest.candidates).not.toEqual(contest.candidates);
  expect(updatedContest.candidates.length).toEqual(contest.candidates.length);
  expect(new Set(updatedContest.candidates)).toEqual(
    new Set(contest.candidates)
  );
});

test('Update system settings', async () => {
  const { apiClient } = setupApp();
  const electionId = (
    await apiClient.createElection({ electionData: undefined })
  ).unsafeUnwrap();
  const electionRecord = await apiClient.getElection({ electionId });

  expect(electionRecord.systemSettings).toEqual(DEFAULT_SYSTEM_SETTINGS);

  const updatedSystemSettings: SystemSettings = {
    ...electionRecord.systemSettings,
    markThresholds: {
      definite: 0.9,
      marginal: 0.8,
    },
    precinctScanAdjudicationReasons: [AdjudicationReason.Overvote],
    centralScanAdjudicationReasons: [
      AdjudicationReason.Undervote,
      AdjudicationReason.MarginalMark,
    ],
  };
  expect(updatedSystemSettings).not.toEqual(DEFAULT_SYSTEM_SETTINGS);

  await apiClient.updateSystemSettings({
    electionId,
    systemSettings: updatedSystemSettings,
  });

  expect(await apiClient.getElection({ electionId })).toEqual({
    ...electionRecord,
    systemSettings: updatedSystemSettings,
  });
});

test('Update layout options', async () => {
  const { apiClient } = setupApp();
  const electionId = (
    await apiClient.createElection({ electionData: undefined })
  ).unsafeUnwrap();
  const electionRecord = await apiClient.getElection({ electionId });

  expect(electionRecord.layoutOptions).toEqual(DEFAULT_LAYOUT_OPTIONS);

  const updatedLayoutOptions: LayoutOptions = {
    bubblePosition: 'right',
    layoutDensity: 2,
  };
  expect(updatedLayoutOptions).not.toEqual(DEFAULT_LAYOUT_OPTIONS);

  await apiClient.updateLayoutOptions({
    electionId,
    layoutOptions: updatedLayoutOptions,
  });

  expect(await apiClient.getElection({ electionId })).toEqual({
    ...electionRecord,
    layoutOptions: updatedLayoutOptions,
  });
});

test('Election package management', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.electionDefinition;
  const { apiClient, workspace } = setupApp();

  const electionId = (
    await apiClient.createElection({
      electionData: baseElectionDefinition.electionData,
    })
  ).unsafeUnwrap();

  const electionPackageBeforeExport = await apiClient.getElectionPackage({
    electionId,
  });
  expect(electionPackageBeforeExport).toEqual({});

  // Initiate an export
  await apiClient.exportElectionPackage({ electionId });
  const electionPackageAfterInitiatingExport =
    await apiClient.getElectionPackage({ electionId });
  expect(electionPackageAfterInitiatingExport).toEqual({
    task: {
      createdAt: expect.any(Date),
      id: expect.any(String),
      payload: `{"electionId":"${electionId}"}`,
      taskName: 'generate_election_package',
    },
  });
  const taskId = assertDefined(electionPackageAfterInitiatingExport.task).id;

  // Check that initiating an export before a prior has completed doesn't trigger a new background
  // task
  await apiClient.exportElectionPackage({ electionId });
  const electionPackageAfterInitiatingRedundantExport =
    await apiClient.getElectionPackage({ electionId });
  expect(electionPackageAfterInitiatingRedundantExport).toEqual(
    electionPackageAfterInitiatingExport
  );

  // Complete an export
  await processNextBackgroundTaskIfAny(workspace);
  const electionPackageAfterExport = await apiClient.getElectionPackage({
    electionId,
  });
  expect(electionPackageAfterExport).toEqual({
    task: {
      completedAt: expect.any(Date),
      createdAt: expect.any(Date),
      id: taskId,
      payload: `{"electionId":"${electionId}"}`,
      startedAt: expect.any(Date),
      taskName: 'generate_election_package',
    },
    url: expect.stringMatching(/.*\/election-package-[0-9a-z]{10}\.zip$/),
  });

  // Check that initiating an export after a prior has completed does trigger a new background task
  await apiClient.exportElectionPackage({ electionId });
  const electionPackageAfterInitiatingSecondExport =
    await apiClient.getElectionPackage({ electionId });
  expect(electionPackageAfterInitiatingSecondExport).toEqual({
    task: {
      createdAt: expect.any(Date),
      id: expect.any(String),
      payload: `{"electionId":"${electionId}"}`,
      taskName: 'generate_election_package',
    },
    url: expect.stringMatching(/.*\/election-package-[0-9a-z]{10}\.zip$/),
  });
  const secondTaskId = assertDefined(
    electionPackageAfterInitiatingSecondExport.task
  ).id;
  expect(secondTaskId).not.toEqual(taskId);
});

test('Election package export', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.electionDefinition;
  const mockSystemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    precinctScanAdjudicationReasons: [
      AdjudicationReason.Overvote,
      AdjudicationReason.UnmarkedWriteIn,
    ],
  };
  const { apiClient, workspace } = setupApp();

  const electionId = (
    await apiClient.createElection({
      electionData: baseElectionDefinition.electionData,
    })
  ).unsafeUnwrap();
  await apiClient.updateSystemSettings({
    electionId,
    systemSettings: mockSystemSettings,
  });
  const { election: appElection } = await apiClient.getElection({ electionId });

  const electionPackageFilePath = await exportElectionPackage({
    apiClient,
    electionId,
    workspace,
  });

  const {
    electionDefinition,
    metadata,
    systemSettings,
    uiStringAudioClips,
    uiStringAudioIds,
    uiStrings,
  } = (
    await readElectionPackageFromFile(electionPackageFilePath)
  ).unsafeUnwrap();
  assert(metadata !== undefined);
  assert(systemSettings !== undefined);
  assert(uiStringAudioClips !== undefined);
  assert(uiStringAudioIds !== undefined);
  assert(uiStrings !== undefined);

  //
  // Check metadata
  //

  expect(metadata.version).toEqual('latest');

  //
  // Check election definition
  //

  expect(electionDefinition.election).toEqual({
    ...baseElectionDefinition.election,

    // Ballot styles are generated in the app, ignoring the ones in the inputted election
    // definition
    ballotStyles: appElection.ballotStyles,

    // The date in the election fixture has a timezone, even though it shouldn't
    date: baseElectionDefinition.election.date.replace(
      '00:00:00-10:00',
      '00:00:00Z'
    ),

    // The base election definition should have been extended with grid layouts. The correctness of
    // the grid layouts is tested by libs/ballot-interpreter tests.
    gridLayouts: expect.any(Array),
  });

  //
  // Check system settings
  //

  expect(systemSettings).toEqual(mockSystemSettings);

  //
  // Check UI strings
  //

  for (const languageCode of Object.values(LanguageCode)) {
    expect(countObjectLeaves(uiStrings[languageCode] ?? {})).toBeGreaterThan(
      // A number high enough to give us confidence that we've exported both app and election strings
      200
    );
  }

  for (const electionStringKey of Object.values(ElectionStringKey)) {
    // The current election definition doesn't include any yes-no contests
    if (
      electionStringKey === ElectionStringKey.CONTEST_DESCRIPTION ||
      electionStringKey === ElectionStringKey.CONTEST_OPTION_LABEL
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
  for (const languageCode of Object.values(LanguageCode)) {
    if (languageCode === LanguageCode.ENGLISH) {
      continue;
    }

    for (const { stringKey, stringInEnglish } of stringsInEnglish) {
      const stringInLanguage = get(uiStrings, [languageCode, stringKey].flat());
      if (
        Array.isArray(stringKey) &&
        stringKey[0] === ElectionStringKey.BALLOT_STYLE_ID
      ) {
        expect(stringInLanguage).not.toBeDefined();
      } else if (
        Array.isArray(stringKey) &&
        stringKey[0] === ElectionStringKey.CANDIDATE_NAME
      ) {
        expect(stringInLanguage).not.toBeDefined();
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
    countObjectLeaves(uiStrings)
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
}, 30_000);

// Rendering an SVG to PDF and then generating the PDF takes about 3s per
// ballot, so we mock the PDF content generation, which means we'll just
// generate empty PDFs, which is much faster.
jest.mock('svg-to-pdfkit');

// Spy on the ballot layout function so we can check that it's called with the
// right arguments.
jest.mock('@votingworks/hmpb-layout', () => {
  const original = jest.requireActual('@votingworks/hmpb-layout');
  return {
    ...original,
    layOutAllBallotStyles: jest.fn(original.layOutAllBallotStyles),
  };
});

test('Export all ballots', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.electionDefinition;
  const { apiClient } = setupApp();

  const electionId = (
    await apiClient.createElection({
      electionData: baseElectionDefinition.electionData,
    })
  ).unsafeUnwrap();
  const { election, layoutOptions } = await apiClient.getElection({
    electionId,
  });

  const { zipContents } = await apiClient.exportAllBallots({
    electionId,
  });
  const zip = await JsZip.loadAsync(zipContents);

  expect(Object.keys(zip.files).sort()).toEqual(
    election.precincts
      .flatMap((precinct) => {
        const precinctName = precinct.name.replaceAll(' ', '_');
        const suffix = `ballot-${precinctName}-ballot-style-1.pdf`;
        return [
          `official-precinct-${suffix}`,
          `test-precinct-${suffix}`,
          `sample-precinct-${suffix}`,
          `official-absentee-${suffix}`,
          `test-absentee-${suffix}`,
          `sample-absentee-${suffix}`,
        ];
      })
      .sort()
  );

  // Ballot appearance is tested by fixtures in libs/hmpb/render-backend, so we
  // just make sure we got a PDF and that we called the layout function with the
  // right arguments.
  for (const file of Object.values(zip.files)) {
    expect(await file.async('text')).toContain('%PDF');
  }
  expect(layOutAllBallotStyles).toHaveBeenCalledTimes(6);
  const expectedLayoutCalls = [
    [BallotType.Precinct, 'official'],
    [BallotType.Precinct, 'test'],
    [BallotType.Precinct, 'sample'],
    [BallotType.Absentee, 'official'],
    [BallotType.Absentee, 'test'],
    [BallotType.Absentee, 'sample'],
  ];
  for (const [
    i,
    [expectedBallotType, expectedBallotMode],
  ] of expectedLayoutCalls.entries()) {
    expect(layOutAllBallotStyles).toHaveBeenNthCalledWith(i + 1, {
      election,
      ballotType: expectedBallotType,
      ballotMode: expectedBallotMode,
      layoutOptions,
      nhCustomContent: {},
      translatedElectionStrings: expect.any(Object),
    });
  }
});

test('Export test decks', async () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  const { apiClient } = setupApp();

  const electionId = (
    await apiClient.createElection({
      electionData: electionDefinition.electionData,
    })
  ).unsafeUnwrap();
  const { election } = await apiClient.getElection({ electionId });

  const { zipContents } = await apiClient.exportTestDecks({
    electionId,
  });
  const zip = await JsZip.loadAsync(zipContents);

  const precinctsWithBallots = election.precincts.filter(
    (precinct) =>
      getBallotStylesByPrecinctId(electionDefinition, precinct.id).length > 0
  );
  expect(Object.keys(zip.files).sort()).toEqual(
    [
      ...precinctsWithBallots.map(
        (precinct) => `${precinct.name.replaceAll(' ', '_')}-test-ballots.pdf`
      ),
      FULL_TEST_DECK_TALLY_REPORT_FILE_NAME,
    ].sort()
  );

  // We test the actual test deck content in test_decks.ts
  for (const file of Object.values(zip.files)) {
    expect(await file.async('text')).toContain('%PDF');
  }
  expect(layOutAllBallotStyles).toHaveBeenCalledTimes(1);
  expect(layOutAllBallotStyles).toHaveBeenCalledWith({
    election,
    ballotType: BallotType.Precinct,
    ballotMode: 'test',
    layoutOptions: DEFAULT_LAYOUT_OPTIONS,
    nhCustomContent: {},
    translatedElectionStrings: expect.any(Object),
  });
});

test('Consistency of election hash across exports', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.electionDefinition;
  const { apiClient, workspace } = setupApp();

  const electionId = (
    await apiClient.createElection({
      electionData: baseElectionDefinition.electionData,
    })
  ).unsafeUnwrap();

  const allBallotsOutput = await apiClient.exportAllBallots({
    electionId,
  });

  const testDecksOutput = await apiClient.exportTestDecks({
    electionId,
  });

  const electionPackageFilePath = await exportElectionPackage({
    apiClient,
    electionId,
    workspace,
  });
  const { electionDefinition } = (
    await readElectionPackageFromFile(electionPackageFilePath)
  ).unsafeUnwrap();

  expect([
    ...new Set([
      allBallotsOutput.electionHash,
      testDecksOutput.electionHash,
      electionDefinition.electionHash,
    ]),
  ]).toHaveLength(1);
}, 30_000);

describe('Ballot style generation', () => {
  const districts: District[] = [
    {
      id: 'district-1' as DistrictId,
      name: 'District 1',
    },
    {
      id: 'district-2' as DistrictId,
      name: 'District 2',
    },
    {
      id: 'district-3' as DistrictId,
      name: 'District 3',
    },
  ];
  const [district1, district2, district3] = districts;

  const parties: Party[] = [
    {
      id: 'party-A' as PartyId,
      name: 'Party A',
      fullName: 'Party A',
      abbrev: 'A',
    },
    {
      id: 'party-B' as PartyId,
      name: 'Party B',
      fullName: 'Party B',
      abbrev: 'B',
    },
    {
      id: 'party-C' as PartyId,
      name: 'Party C',
      fullName: 'Party C',
      abbrev: 'C',
    },
  ];
  const [partyA, partyB, partyC] = parties;

  function makeContest(
    id: string,
    districtId: DistrictId,
    partyId?: PartyId
  ): AnyContest {
    return {
      id,
      districtId,
      type: 'candidate',
      title: id,
      candidates: [],
      allowWriteIns: true,
      seats: 1,
      partyId,
    };
  }

  async function setupElection(
    apiClient: ApiClient,
    spec: {
      type: ElectionType;
      districts: District[];
      precincts: Precinct[];
      contests: Contests;
      parties?: Parties;
    }
  ) {
    const electionId = (
      await apiClient.createElection({ electionData: undefined })
    ).unsafeUnwrap();
    const { election } = await apiClient.getElection({ electionId });
    await apiClient.updateElection({
      electionId,
      election: {
        ...election,
        type: spec.type,
        districts: spec.districts,
        contests: spec.contests,
        parties: spec.parties ?? [],
      },
    });
    await apiClient.updatePrecincts({ electionId, precincts: spec.precincts });
    return electionId;
  }

  test('General election, no splits', async () => {
    const { apiClient } = setupApp();

    const precincts: Precinct[] = [
      {
        id: 'precinct-1',
        name: 'Precinct 1',
        districtIds: [district1.id],
      },
      {
        id: 'precinct-2',
        name: 'Precinct 2',
        districtIds: [district2.id],
      },
      {
        id: 'precinct-3',
        name: 'Precinct 3',
        districtIds: [district1.id, district2.id],
      },
      {
        id: 'precinct-4',
        name: 'Precinct 4',
        // Shouldn't get a ballot style, since no districts assigned
        districtIds: [],
      },
    ];
    const contests: Contests = [
      makeContest('contest-1', district1.id),
      makeContest('contest-2', district2.id),
    ];

    const electionId = await setupElection(apiClient, {
      type: 'general',
      districts,
      precincts,
      contests,
    });

    const { ballotStyles } = await apiClient.getElection({ electionId });
    const [precinct1, precinct2, precinct3] = precincts;
    expect(ballotStyles).toEqual([
      {
        id: 'ballot-style-1',
        districtIds: [district1.id],
        precinctsOrSplits: [{ precinctId: precinct1.id }],
      },
      {
        id: 'ballot-style-2',
        districtIds: [district2.id],
        precinctsOrSplits: [{ precinctId: precinct2.id }],
      },
      {
        id: 'ballot-style-3',
        districtIds: [district1.id, district2.id],
        precinctsOrSplits: [{ precinctId: precinct3.id }],
      },
    ]);
  });

  test('General election, split precincts', async () => {
    const { apiClient } = setupApp();

    const precincts: Precinct[] = [
      {
        id: 'precinct-1',
        name: 'Precinct 1',
        districtIds: [district1.id],
      },
      {
        id: 'precinct-2',
        name: 'Precinct 2',
        splits: [
          {
            id: 'precinct-2-split-1',
            name: 'Precinct 2 - Split 1',
            districtIds: [district1.id, district2.id],
            nhCustomContent: {
              electionTitle: 'Annual Town Election',
              clerkSignatureImage: '<svg>town clerk signature image data</svg>',
              clerkSignatureCaption: 'Town Clerk',
            },
          },
          {
            id: 'precinct-2-split-2',
            name: 'Precinct 2 - Split 2',
            districtIds: [district1.id, district3.id],
            nhCustomContent: {
              electionTitle: 'Annual School District Election',
              clerkSignatureImage:
                '<svg>school district clerk signature image data</svg>',
              clerkSignatureCaption: 'School District Clerk',
            },
          },
          {
            id: 'precinct-2-split-3',
            name: 'Precinct 2 - Split 3',
            // Should share a ballot style with precinct-1, since same districts assigned
            districtIds: [district1.id],
            nhCustomContent: {},
          },
          {
            id: 'precinct-2-split-4',
            name: 'Precinct 2 - Split 4',
            // Shouldn't get a ballot style, since no districts assigned
            districtIds: [],
            nhCustomContent: {},
          },
        ],
      },
    ];
    const contests: Contests = [
      makeContest('contest-1', district1.id),
      makeContest('contest-2', district2.id),
    ];

    const electionId = await setupElection(apiClient, {
      type: 'general',
      districts,
      precincts,
      contests,
    });

    const { ballotStyles, nhCustomContent } = await apiClient.getElection({
      electionId,
    });
    const [precinct1, precinct2] = precincts;
    assert(hasSplits(precinct2));
    const [split1, split2, split3] = precinct2.splits;
    expect(ballotStyles).toEqual([
      {
        id: 'ballot-style-1',
        districtIds: [district1.id],
        precinctsOrSplits: [
          { precinctId: precinct1.id },
          {
            precinctId: precinct2.id,
            splitId: split3.id,
          },
        ],
      },
      {
        id: 'ballot-style-2',
        districtIds: [district1.id, district2.id],
        precinctsOrSplits: [{ precinctId: precinct2.id, splitId: split1.id }],
      },
      {
        id: 'ballot-style-3',
        districtIds: [district1.id, district3.id],
        precinctsOrSplits: [{ precinctId: precinct2.id, splitId: split2.id }],
      },
    ]);
    expect(nhCustomContent).toEqual({
      'ballot-style-2': {
        electionTitle: 'Annual Town Election',
        clerkSignatureImage: '<svg>town clerk signature image data</svg>',
        clerkSignatureCaption: 'Town Clerk',
      },
      'ballot-style-3': {
        electionTitle: 'Annual School District Election',
        clerkSignatureImage:
          '<svg>school district clerk signature image data</svg>',
        clerkSignatureCaption: 'School District Clerk',
      },
    });
  });

  test('Primary election, no splits', async () => {
    const { apiClient } = setupApp();

    const precincts: Precinct[] = [
      {
        id: 'precinct-1',
        name: 'Precinct 1',
        districtIds: [district1.id],
      },
      {
        id: 'precinct-2',
        name: 'Precinct 2',
        districtIds: [district2.id, district3.id],
      },
      {
        id: 'precinct-3',
        name: 'Precinct 3',
        districtIds: [district3.id],
      },
    ];
    const contests: Contests = [
      makeContest('contest-1A', district1.id, partyA.id),
      makeContest('contest-1B', district1.id, partyB.id),
      makeContest('contest-2A', district2.id, partyA.id),
      makeContest('contest-2B', district2.id, partyB.id),
      makeContest('contest-2C', district2.id, partyC.id),
      makeContest('contest-3A', district3.id, partyA.id),
      makeContest('contest-3C', district3.id, partyC.id),
      makeContest('contest-4', district1.id),
      makeContest('contest-5', district3.id),
    ];

    const electionId = await setupElection(apiClient, {
      type: 'primary',
      districts,
      precincts,
      contests,
      parties,
    });

    const { ballotStyles } = await apiClient.getElection({ electionId });
    const [precinct1, precinct2, precinct3] = precincts;
    expect(ballotStyles).toEqual([
      {
        id: 'ballot-style-1-A',
        districtIds: [district1.id],
        partyId: partyA.id,
        precinctsOrSplits: [{ precinctId: precinct1.id }],
      },
      {
        id: 'ballot-style-1-B',
        districtIds: [district1.id],
        partyId: partyB.id,
        precinctsOrSplits: [{ precinctId: precinct1.id }],
      },
      {
        id: 'ballot-style-2-A',
        districtIds: [district2.id, district3.id],
        partyId: partyA.id,
        precinctsOrSplits: [{ precinctId: precinct2.id }],
      },
      {
        id: 'ballot-style-2-B',
        districtIds: [district2.id, district3.id],
        partyId: partyB.id,
        precinctsOrSplits: [{ precinctId: precinct2.id }],
      },
      {
        id: 'ballot-style-2-C',
        districtIds: [district2.id, district3.id],
        partyId: partyC.id,
        precinctsOrSplits: [{ precinctId: precinct2.id }],
      },
      {
        id: 'ballot-style-3-A',
        districtIds: [district3.id],
        partyId: partyA.id,
        precinctsOrSplits: [{ precinctId: precinct3.id }],
      },
      {
        id: 'ballot-style-3-C',
        districtIds: [district3.id],
        partyId: partyC.id,
        precinctsOrSplits: [{ precinctId: precinct3.id }],
      },
    ]);
  });

  test('Primary election, split precincts', async () => {
    const { apiClient } = setupApp();
    const precincts: Precinct[] = [
      {
        id: 'precinct-1',
        name: 'Precinct 1',
        splits: [
          {
            id: 'precinct-1-split-1',
            name: 'Precinct 1 - Split 1',
            districtIds: [district1.id, district2.id],
            nhCustomContent: {},
          },
          {
            id: 'precinct-1-split-2',
            name: 'Precinct 1 - Split 2',
            districtIds: [district1.id, district3.id],
            nhCustomContent: {},
          },
          {
            id: 'precinct-1-split-3',
            name: 'Precinct 1 - Split 3',
            // Shouldn't get a ballot style, since no districts assigned
            districtIds: [],
            nhCustomContent: {},
          },
          {
            id: 'precinct-1-split-4',
            name: 'Precinct 1 - Split 4',
            // Should share a ballot style with precinct-2, since same districts assigned
            districtIds: [district2.id],
            nhCustomContent: {},
          },
        ],
      },
      {
        id: 'precinct-2',
        name: 'Precinct 2',
        districtIds: [district2.id],
      },
    ];
    const contests: Contests = [
      makeContest('contest-1A', district1.id, partyA.id),
      makeContest('contest-1B', district1.id, partyB.id),
      makeContest('contest-2A', district2.id, partyA.id),
      makeContest('contest-2B', district2.id, partyB.id),
      makeContest('contest-2C', district2.id, partyC.id),
      makeContest('contest-3A', district3.id, partyA.id),
      makeContest('contest-3C', district3.id, partyC.id),
      makeContest('contest-4', district1.id),
      makeContest('contest-5', district3.id),
    ];

    const electionId = await setupElection(apiClient, {
      type: 'primary',
      districts,
      precincts,
      contests,
      parties,
    });

    const { ballotStyles } = await apiClient.getElection({ electionId });
    const [precinct1, precinct2] = precincts;
    assert(hasSplits(precinct1));
    const [split1, split2, , split4] = precinct1.splits;
    expect(ballotStyles).toEqual([
      {
        id: 'ballot-style-1-A',
        districtIds: [district1.id, district2.id],
        partyId: partyA.id,
        precinctsOrSplits: [{ precinctId: precinct1.id, splitId: split1.id }],
      },
      {
        id: 'ballot-style-1-B',
        districtIds: [district1.id, district2.id],
        partyId: partyB.id,
        precinctsOrSplits: [{ precinctId: precinct1.id, splitId: split1.id }],
      },
      {
        id: 'ballot-style-1-C',
        districtIds: [district1.id, district2.id],
        partyId: partyC.id,
        precinctsOrSplits: [{ precinctId: precinct1.id, splitId: split1.id }],
      },
      {
        id: 'ballot-style-2-A',
        districtIds: [district1.id, district3.id],
        partyId: partyA.id,
        precinctsOrSplits: [{ precinctId: precinct1.id, splitId: split2.id }],
      },
      {
        id: 'ballot-style-2-B',
        districtIds: [district1.id, district3.id],
        partyId: partyB.id,
        precinctsOrSplits: [{ precinctId: precinct1.id, splitId: split2.id }],
      },
      {
        id: 'ballot-style-2-C',
        districtIds: [district1.id, district3.id],
        partyId: partyC.id,
        precinctsOrSplits: [{ precinctId: precinct1.id, splitId: split2.id }],
      },
      {
        id: 'ballot-style-3-A',
        districtIds: [district2.id],
        partyId: partyA.id,
        precinctsOrSplits: [
          { precinctId: precinct1.id, splitId: split4.id },
          { precinctId: precinct2.id },
        ],
      },
      {
        id: 'ballot-style-3-B',
        districtIds: [district2.id],
        partyId: partyB.id,
        precinctsOrSplits: [
          { precinctId: precinct1.id, splitId: split4.id },
          { precinctId: precinct2.id },
        ],
      },
      {
        id: 'ballot-style-3-C',
        districtIds: [district2.id],
        partyId: partyC.id,
        precinctsOrSplits: [
          { precinctId: precinct1.id, splitId: split4.id },
          { precinctId: precinct2.id },
        ],
      },
    ]);
  });
});
