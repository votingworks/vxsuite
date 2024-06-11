import { readElection } from '@votingworks/fs';
import {
  Renderer,
  createPlaywrightRenderer,
  famousNamesFixtures,
  generalElectionFixtures,
  primaryElectionFixtures,
  renderAllBallotsAndCreateElectionDefinition,
  vxDefaultBallotTemplate,
} from '@votingworks/hmpb';
import { assert, find, iter } from '@votingworks/basics';
import {
  buildContestResultsFixture,
  getBallotStylesByPrecinctId,
} from '@votingworks/utils';
import {
  createPrecinctTestDeck,
  createTestDeckTallyReport,
  getTallyReportResults,
} from './test_decks';

let renderer: Renderer;
beforeAll(async () => {
  renderer = await createPlaywrightRenderer();
});
afterAll(async () => {
  await renderer.cleanup();
});

describe('createPrecinctTestDeck', () => {
  test('for a precinct with one ballot style', async () => {
    const fixtures = famousNamesFixtures;
    const electionDefinition = (
      await readElection(fixtures.electionPath)
    ).unsafeUnwrap();
    const { election } = electionDefinition;
    const precinctId = election.precincts[0].id;
    assert(
      getBallotStylesByPrecinctId(electionDefinition, precinctId).length === 1
    );
    const { ballotDocuments } =
      await renderAllBallotsAndCreateElectionDefinition(
        renderer,
        vxDefaultBallotTemplate,
        fixtures.allBallotProps
      );
    const ballots = iter(fixtures.allBallotProps)
      .zip(ballotDocuments)
      .map(([props, document]) => ({ props, document }))
      .toArray();

    const testDeckDocument = await createPrecinctTestDeck({
      renderer,
      election,
      precinctId,
      ballots,
    });
    await expect(testDeckDocument).toMatchPdfSnapshot();
  });

  test('for a precinct with multiple ballot styles', async () => {
    const fixtures = primaryElectionFixtures;
    const electionDefinition = (
      await readElection(fixtures.electionPath)
    ).unsafeUnwrap();
    const { election } = electionDefinition;
    const precinctId = election.precincts[0].id;
    assert(
      getBallotStylesByPrecinctId(electionDefinition, precinctId).length > 1
    );
    const { ballotDocuments } =
      await renderAllBallotsAndCreateElectionDefinition(
        renderer,
        vxDefaultBallotTemplate,
        fixtures.allBallotProps
      );
    const ballots = iter(fixtures.allBallotProps)
      .zip(ballotDocuments)
      .map(([props, document]) => ({ props, document }))
      .toArray();

    const testDeckDocument = await createPrecinctTestDeck({
      renderer,
      election,
      precinctId,
      ballots,
    });
    await expect(testDeckDocument).toMatchPdfSnapshot();
  });

  test('for a precinct with no ballot styles', async () => {
    const fixtures = generalElectionFixtures.fixtureSpecs[0];
    const electionDefinition = (
      await readElection(fixtures.electionPath)
    ).unsafeUnwrap();
    const { election } = electionDefinition;
    const precinctWithNoBallotStyles = find(
      election.precincts,
      (precinct) =>
        getBallotStylesByPrecinctId(electionDefinition, precinct.id).length ===
        0
    );

    const testDeckDocument = await createPrecinctTestDeck({
      renderer,
      election,
      precinctId: precinctWithNoBallotStyles.id,
      ballots: [], // doesn't matter
    });
    expect(testDeckDocument).toBeUndefined();
  });
});

describe('getTallyReportResults', () => {
  test('general', async () => {
    const fixtures = famousNamesFixtures;
    const electionDefinition = (
      await readElection(fixtures.electionPath)
    ).unsafeUnwrap();
    const { election } = electionDefinition;

    const tallyReportResults = await getTallyReportResults(election);

    expect(tallyReportResults.hasPartySplits).toEqual(false);
    expect(tallyReportResults.contestIds).toEqual(
      election.contests.map((c) => c.id)
    );
    expect(tallyReportResults.manualResults).toBeUndefined();
    const { scannedResults } = tallyReportResults;
    expect(scannedResults.cardCounts).toEqual({
      bmd: 0,
      hmpb: [52],
    });

    // check one contest
    expect(scannedResults.contestResults['board-of-alderman']).toEqual(
      buildContestResultsFixture({
        contest: find(election.contests, (c) => c.id === 'board-of-alderman'),
        contestResultsSummary: {
          type: 'candidate',
          ballots: 52,
          overvotes: 0,
          undervotes: 156,
          officialOptionTallies: {
            'helen-keller': 8,
            'nikola-tesla': 8,
            'pablo-picasso': 4,
            'steve-jobs': 8,
            'vincent-van-gogh': 4,
            'wolfgang-amadeus-mozart': 4,
            'write-in': 16,
          },
        },
        includeGenericWriteIn: true,
      })
    );
  });

  test('primary', async () => {
    const fixtures = primaryElectionFixtures;
    const electionDefinition = (
      await readElection(fixtures.electionPath)
    ).unsafeUnwrap();
    const { election } = electionDefinition;

    const tallyReportResults = await getTallyReportResults(election);

    expect(tallyReportResults.hasPartySplits).toEqual(true);
    expect(tallyReportResults.contestIds).toEqual(
      election.contests.map((c) => c.id)
    );
    expect(tallyReportResults.manualResults).toBeUndefined();
    expect(
      tallyReportResults.hasPartySplits && tallyReportResults.cardCountsByParty
    ).toEqual({
      '0': {
        bmd: 0,
        hmpb: [25],
      },
      '1': {
        bmd: 0,
        hmpb: [25],
      },
    });
    const { scannedResults } = tallyReportResults;
    expect(scannedResults.cardCounts).toEqual({
      bmd: 0,
      hmpb: [50],
      manual: 0,
    });

    // check one contest
    expect(scannedResults.contestResults['county-leader-mammal']).toEqual(
      buildContestResultsFixture({
        contest: find(
          election.contests,
          (c) => c.id === 'county-leader-mammal'
        ),
        contestResultsSummary: {
          type: 'candidate',
          ballots: 25,
          overvotes: 0,
          undervotes: 0,
          officialOptionTallies: {
            fox: 5,
            horse: 10,
            otter: 10,
          },
        },
        includeGenericWriteIn: false,
      })
    );
  });
});

test('createTestDeckTallyReport', async () => {
  const fixtures = generalElectionFixtures.fixtureSpecs[0];
  const electionDefinition = (
    await readElection(fixtures.electionPath)
  ).unsafeUnwrap();

  const reportDocumentBuffer = await createTestDeckTallyReport({
    electionDefinition,
    generatedAtTime: new Date('2021-01-01T00:00:00.000'),
  });

  await expect(reportDocumentBuffer).toMatchPdfSnapshot();
});
