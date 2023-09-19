import { assert } from '@votingworks/basics';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  DEFAULT_LAYOUT_OPTIONS,
  layOutAllBallotStyles,
  LayoutOptions,
} from '@votingworks/hmpb-layout';
import {
  AdjudicationReason,
  AnyContest,
  BallotType,
  Contests,
  DEFAULT_SYSTEM_SETTINGS,
  District,
  DistrictId,
  Election,
  ElectionType,
  Parties,
  Party,
  PartyId,
  safeParseElectionDefinition,
  safeParseSystemSettings,
  SystemSettings,
} from '@votingworks/types';
import JsZip from 'jszip';
import { ApiClient, testSetupHelpers } from '../test/helpers';
import { hasSplits, Precinct } from './store';

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
      type: 'general',
    },
    systemSettings: DEFAULT_SYSTEM_SETTINGS,
    ballotStyles: [],
    precincts: [],
    layoutOptions: DEFAULT_LAYOUT_OPTIONS,
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
  const { election: appElection } = await apiClient.getElection({ electionId });

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
    date: baseElectionDefinition.election.date.replace(
      '00:00:00-10:00',
      '00:00:00Z'
    ),

    // Ballot styles are generated in the app, ignoring the ones in the inputted
    // election definition.
    ballotStyles: appElection.ballotStyles,

    // The base election definition should have been extended with grid layouts.
    // The correctness of the grid layouts is tested by libs/ballot-interpreter
    // tests.
    gridLayouts: expect.any(Array),
  });

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
    });
  }

  const setupPackageResult = await apiClient.exportSetupPackage({ electionId });
  expect(electionHash).toEqual(setupPackageResult.electionHash);
});

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
          },
          {
            id: 'precinct-2-split-2',
            name: 'Precinct 2 - Split 2',
            districtIds: [district1.id, district3.id],
          },
          {
            id: 'precinct-2-split-3',
            name: 'Precinct 2 - Split 3',
            // Should share a ballot style with precinct-1, since same districts assigned
            districtIds: [district1.id],
          },
          {
            id: 'precinct-2-split-4',
            name: 'Precinct 2 - Split 4',
            // Shouldn't get a ballot style, since no districts assigned
            districtIds: [],
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

    const { ballotStyles } = await apiClient.getElection({ electionId });
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
          },
          {
            id: 'precinct-1-split-2',
            name: 'Precinct 1 - Split 2',
            districtIds: [district1.id, district3.id],
          },
          {
            id: 'precinct-1-split-3',
            name: 'Precinct 1 - Split 3',
            // Shouldn't get a ballot style, since no districts assigned
            districtIds: [],
          },
          {
            id: 'precinct-1-split-4',
            name: 'Precinct 1 - Split 4',
            // Should share a ballot style with precinct-2, since same districts assigned
            districtIds: [district2.id],
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
