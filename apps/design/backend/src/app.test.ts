import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  DEFAULT_LAYOUT_OPTIONS,
  layOutAllBallotStyles,
  LayoutOptions,
} from '@votingworks/hmpb-layout';
import {
  AdjudicationReason,
  BallotType,
  DEFAULT_SYSTEM_SETTINGS,
  Election,
  safeParseElectionDefinition,
  safeParseSystemSettings,
  SystemSettings,
} from '@votingworks/types';
import JsZip from 'jszip';
import { testSetupHelpers } from '../test/helpers';

const { setupApp, cleanup } = testSetupHelpers();

afterAll(cleanup);

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
    },
    systemSettings: DEFAULT_SYSTEM_SETTINGS,
    ballotStyles: [],
    precincts: [],
    layoutOptions: DEFAULT_LAYOUT_OPTIONS,
    createdAt: expect.any(String),
  });

  expect(await apiClient.listElections()).toEqual([election]);

  const electionId2 = (
    await apiClient.createElection({
      electionData:
        electionFamousNames2021Fixtures.electionDefinition.electionData,
    })
  ).unsafeUnwrap();
  expect(electionId2).toEqual('2');

  const election2 = await apiClient.getElection({ electionId: electionId2 });
  expect(election2).toMatchObject({
    id: '2',
    election: {
      ...electionFamousNames2021Fixtures.electionDefinition.election,
      ballotStyles: [
        {
          id: 'ballot-style-1',
          precincts: ['23', '22', '21', '20'],
        },
      ],
    },
    systemSettings: DEFAULT_SYSTEM_SETTINGS,
    // TODO test that ballot styles/precincts are correct
    ballotStyles: expect.any(Array),
    precincts: expect.any(Array),
    createdAt: expect.any(String),
  });

  expect(await apiClient.listElections()).toEqual([election, election2]);

  const updatedElection: Election = {
    ...election.election,
    title: 'Updated Election',
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

test('Export setup package', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.electionDefinition;
  const { apiClient } = setupApp();

  const electionId = (
    await apiClient.createElection({
      electionData: baseElectionDefinition.electionData,
    })
  ).unsafeUnwrap();

  const { zipContents, electionHash } = await apiClient.exportSetupPackage({
    electionId,
  });
  const zip = await JsZip.loadAsync(zipContents);

  expect(Object.keys(zip.files)).toEqual([
    'election.json',
    'systemSettings.json',
  ]);

  const electionDefinition = safeParseElectionDefinition(
    await zip.file('election.json')!.async('text')
  ).unsafeUnwrap();
  expect(electionHash).toEqual(electionDefinition.electionHash);

  expect(electionDefinition.election).toEqual({
    ...baseElectionDefinition.election,
    // The date in the election fixture has a timezone, even though it shouldn't
    date: electionDefinition.election.date,

    // Ballot styles are generated in the app, ignoring the ones in the inputted
    // election definition.
    ballotStyles: electionDefinition.election.ballotStyles,

    // The base election definition should have been extended with grid layouts.
    // The correctness of the grid layouts is tested by libs/ballot-interpreter
    // tests.
    gridLayouts: electionDefinition.election.gridLayouts,
  });

  // We should have a ballot style for each precinct with a unique set of
  // contests (via districts). In this case, all the precincts share the same
  // contests.
  expect(electionDefinition.election.ballotStyles).toMatchInlineSnapshot(`
    [
      {
        "districts": [
          "district-1",
        ],
        "id": "ballot-style-1",
        "partyId": undefined,
        "precincts": [
          "23",
          "22",
          "21",
          "20",
        ],
      },
    ]
  `);

  const systemSettings = safeParseSystemSettings(
    await zip.file('systemSettings.json')!.async('text')
  ).unsafeUnwrap();
  expect(systemSettings).toEqual(DEFAULT_SYSTEM_SETTINGS);
});

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

  const { zipContents, electionHash } = await apiClient.exportAllBallots({
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
    [BallotType.Standard, 'official'],
    [BallotType.Standard, 'test'],
    [BallotType.Standard, 'sample'],
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
    });
  }

  const setupPackageResult = await apiClient.exportSetupPackage({ electionId });
  expect(electionHash).toEqual(setupPackageResult.electionHash);
});
