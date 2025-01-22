import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
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
import { ElectionDefinition, LanguageCode } from '@votingworks/types';
import {
  createPrecinctTestDeck,
  createTestDeckTallyReport,
  getTallyReportResults,
} from './test_decks';

vi.setConfig({
  testTimeout: 30000,
});

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
    const { electionDefinition } = famousNamesFixtures;
    const { election } = electionDefinition;
    const precinctId = election.precincts[0].id;
    assert(
      getBallotStylesByPrecinctId(electionDefinition, precinctId).length === 1
    );
    const { ballotDocuments } =
      await renderAllBallotsAndCreateElectionDefinition(
        renderer,
        vxDefaultBallotTemplate,
        fixtures.allBallotProps,
        'vxf'
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
    const primaryElectionDefinition = fixtures.electionDefinition;
    // Test takes unnecessarily long if using all language ballot styles
    const electionDefinition: ElectionDefinition = {
      ...primaryElectionDefinition,
      election: {
        ...primaryElectionDefinition.election,
        ballotStyles: primaryElectionDefinition.election.ballotStyles.filter(
          (bs) =>
            bs.languages &&
            bs.languages.length === 1 &&
            bs.languages[0] === LanguageCode.ENGLISH
        ),
      },
    };
    const { election } = electionDefinition;
    const precinctId = election.precincts[0].id;
    assert(
      getBallotStylesByPrecinctId(electionDefinition, precinctId).length > 1
    );
    const { ballotDocuments } =
      await renderAllBallotsAndCreateElectionDefinition(
        renderer,
        vxDefaultBallotTemplate,
        fixtures.allBallotProps,
        'vxf'
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
    const { electionDefinition } = famousNamesFixtures;
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
    const { electionDefinition } = primaryElectionFixtures;
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
        hmpb: [100],
      },
      '1': {
        bmd: 0,
        hmpb: [100],
      },
    });
    const { scannedResults } = tallyReportResults;
    expect(scannedResults.cardCounts).toEqual({
      bmd: 0,
      hmpb: [200],
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
          ballots: 100,
          overvotes: 0,
          undervotes: 0,
          officialOptionTallies: {
            fox: 20,
            horse: 40,
            otter: 40,
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
