import { Buffer } from 'buffer';
import JsZip from 'jszip';
import get from 'lodash.get';
import {
  DateWithoutTime,
  assert,
  assertDefined,
  find,
} from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import {
  AdjudicationReason,
  BallotType,
  CandidateContest,
  DEFAULT_SYSTEM_SETTINGS,
  DistrictId,
  Election,
  ElectionStringKey,
  LanguageCode,
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
  BallotMode,
  BaseBallotProps,
  renderAllBallotsAndCreateElectionDefinition,
  vxDefaultBallotTemplate,
} from '@votingworks/hmpb';
import {
  exportElectionPackage,
  isMockCloudSynthesizedSpeech,
  mockCloudTranslatedText,
  processNextBackgroundTaskIfAny,
  testSetupHelpers,
} from '../test/helpers';
import { FULL_TEST_DECK_TALLY_REPORT_FILE_NAME } from './test_decks';
import { forEachUiString } from './language_and_audio';
import {
  BallotStyle,
  Precinct,
  convertToVxfBallotStyle,
  getAllBallotLanguages,
} from './types';
import { generateBallotStyles } from './ballot_styles';
import { ElectionRecord } from '.';
import { getTempBallotLanguageConfigsForCert } from './store';

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
      date: expect.any(DateWithoutTime),
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
    createdAt: expect.any(String),
    ballotLanguageConfigs: getTempBallotLanguageConfigsForCert(),
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

  const expectedPrecincts: Precinct[] =
    election2Definition.election.precincts.map((vxfPrecinct) => ({
      id: vxfPrecinct.id,
      name: vxfPrecinct.name,
      districtIds: ['district-1' as DistrictId],
    }));
  const expectedBallotStyles: BallotStyle[] = generateBallotStyles({
    ballotLanguageConfigs: election2.ballotLanguageConfigs,
    contests: election2Definition.election.contests,
    electionType: election2Definition.election.type,
    parties: election2Definition.election.parties,
    precincts: expectedPrecincts,
  });

  expect(election2).toEqual<ElectionRecord>({
    id: '2',
    election: {
      ...election2Definition.election,
      ballotStyles: expectedBallotStyles.map(convertToVxfBallotStyle),
    },
    systemSettings: DEFAULT_SYSTEM_SETTINGS,
    // TODO test that ballot styles/precincts are correct
    ballotStyles: expectedBallotStyles,
    precincts: expectedPrecincts,
    createdAt: expect.any(String),
    ballotLanguageConfigs: getTempBallotLanguageConfigsForCert(),
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
  const electionRecord = await apiClient.getElection({ electionId });
  const { ballotLanguageConfigs, election: appElection } = electionRecord;

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

  const allBallotLanguages = getAllBallotLanguages(ballotLanguageConfigs);
  for (const languageCode of allBallotLanguages) {
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
  for (const languageCode of allBallotLanguages) {
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

// Spy on the ballot rendering function so we can check that it's called with the
// right arguments.
jest.mock('@votingworks/hmpb', () => {
  const original = jest.requireActual('@votingworks/hmpb');
  return {
    ...original,
    renderAllBallotsAndCreateElectionDefinition: jest.fn(
      original.renderAllBallotsAndCreateElectionDefinition
    ),
  };
});

test('Export all ballots', async () => {
  // This test runs unnecessarily long if we're generating exports for all
  // languages, so disabling multi-language support for this case:
  mockFeatureFlagger.disableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_CLOUD_TRANSLATION_AND_SPEECH_SYNTHESIS
  );

  const baseElectionDefinition =
    electionFamousNames2021Fixtures.electionDefinition;
  const { apiClient } = setupApp();

  const electionId = (
    await apiClient.createElection({
      electionData: baseElectionDefinition.electionData,
    })
  ).unsafeUnwrap();
  const { ballotStyles, election, precincts } = await apiClient.getElection({
    electionId,
  });

  const { zipContents } = await apiClient.exportAllBallots({
    electionId,
  });
  const zip = await JsZip.loadAsync(zipContents);

  expect(Object.keys(zip.files).sort()).toEqual(
    ballotStyles
      .flatMap(({ id, precinctsOrSplits }) =>
        precinctsOrSplits.map((p) => ({
          ballotStyleId: id,
          precinctId: p.precinctId,
        }))
      )
      .flatMap(({ ballotStyleId, precinctId }) => {
        const precinctName = find(
          precincts,
          (p) => p.id === precinctId
        ).name.replaceAll(' ', '_');

        const suffix = `ballot-${precinctName}-${ballotStyleId}.pdf`;

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

  // Ballot appearance is tested by fixtures in libs/hmpb, so we
  // just make sure we got a PDF and that we called the layout function with the
  // right arguments.
  for (const file of Object.values(zip.files)) {
    expect(await file.async('text')).toContain('%PDF');
  }
  expect(renderAllBallotsAndCreateElectionDefinition).toHaveBeenCalledTimes(1);
  const ballotCombos: Array<[BallotType, BallotMode]> = [
    [BallotType.Precinct, 'official'],
    [BallotType.Precinct, 'test'],
    [BallotType.Precinct, 'sample'],
    [BallotType.Absentee, 'official'],
    [BallotType.Absentee, 'test'],
    [BallotType.Absentee, 'sample'],
  ];
  const expectedBallotProps = election.ballotStyles.flatMap((ballotStyle) =>
    ballotStyle.precincts.flatMap((precinctId) =>
      ballotCombos.map(
        ([ballotType, ballotMode]): BaseBallotProps => ({
          election,
          ballotStyleId: ballotStyle.id,
          precinctId,
          ballotType,
          ballotMode,
        })
      )
    )
  );
  expect(renderAllBallotsAndCreateElectionDefinition).toHaveBeenCalledWith(
    expect.any(Object), // Renderer
    vxDefaultBallotTemplate,
    expectedBallotProps,
    expect.any(Object) // Election strings
  );
});

test('Export test decks', async () => {
  // This test runs unnecessarily long if we're generating exports for all
  // languages, so disabling multi-language support for this case:
  mockFeatureFlagger.disableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_CLOUD_TRANSLATION_AND_SPEECH_SYNTHESIS
  );

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
  expect(renderAllBallotsAndCreateElectionDefinition).toHaveBeenCalledTimes(1);
  const expectedBallotProps = election.ballotStyles.flatMap((ballotStyle) =>
    ballotStyle.precincts.map((precinctId) => ({
      election,
      ballotStyleId: ballotStyle.id,
      precinctId,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
    }))
  );
  expect(renderAllBallotsAndCreateElectionDefinition).toHaveBeenCalledWith(
    expect.any(Object), // Renderer
    vxDefaultBallotTemplate,
    expectedBallotProps,
    expect.any(Object) // Election strings
  );
}, 30_000);

test('Consistency of election hash across exports', async () => {
  // This test runs unnecessarily long if we're generating exports for all
  // languages, so disabling multi-language support for this case:
  mockFeatureFlagger.disableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_CLOUD_TRANSLATION_AND_SPEECH_SYNTHESIS
  );

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
