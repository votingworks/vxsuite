import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { readElection } from '@votingworks/fs';
import {
  RendererPool,
  allBaseBallotProps,
  ballotTemplates,
  createPlaywrightRendererPool,
  layOutBallotsAndCreateElectionDefinition,
  vxFamousNamesFixtures,
  vxGeneralElectionFixtures,
  vxPrimaryElectionFixtures,
} from '@votingworks/hmpb';
import { assert, find, iter } from '@votingworks/basics';
import {
  buildContestResultsFixture,
  CachedElectionLookups,
  generateTestDeckBallots,
  getBallotStyleGroupsForPrecinctOrSplit,
} from '@votingworks/utils';
import {
  BallotType,
  ElectionDefinition,
  hasSplits,
  LanguageCode,
} from '@votingworks/types';
import {
  createPrecinctTestDeck,
  createTestDeckTallyReport,
  getTallyReportResults,
} from './test_decks';

vi.setConfig({
  testTimeout: 90_000,
});

vi.mock(import('@votingworks/types'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    formatBallotHash: vi.fn().mockReturnValue('0000000'),
  };
});

let rendererPool: RendererPool;
beforeAll(async () => {
  rendererPool = await createPlaywrightRendererPool();
});
afterAll(async () => {
  await rendererPool.close();
});

describe('createPrecinctTestDeck', () => {
  test('for a precinct with one ballot style', async () => {
    const fixtures = vxFamousNamesFixtures;
    const { electionDefinition } = vxFamousNamesFixtures;
    const { election } = electionDefinition;
    const precinctId = election.precincts[0].id;
    assert(
      CachedElectionLookups.getBallotStylesByPrecinctId(
        electionDefinition,
        precinctId
      ).length === 1
    );
    const { ballotContents } = await layOutBallotsAndCreateElectionDefinition(
      rendererPool,
      ballotTemplates.VxDefaultBallot,
      fixtures.allBallotProps,
      'vxf'
    );
    const ballots = iter(fixtures.allBallotProps)
      .zip(ballotContents)
      .map(([props, contents]) => ({ props, contents }))
      .toArray();

    const ballotSpecs = generateTestDeckBallots({
      election,
      precinctId,
      markingMethod: 'hand',
    });
    const testDeckDocument = await createPrecinctTestDeck({
      rendererPool,
      electionDefinition,
      ballotSpecs,
      ballots,
    });
    await expect(testDeckDocument).toMatchPdfSnapshot();
  });

  test('for a precinct with multiple ballot styles', async () => {
    const fixtures = vxPrimaryElectionFixtures;
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
    const ballotProps = allBaseBallotProps(election).filter(
      (props) =>
        props.ballotMode === 'test' && props.ballotType === BallotType.Precinct
    );
    const [precinct] = election.precincts;
    assert(!hasSplits(precinct));
    assert(
      getBallotStyleGroupsForPrecinctOrSplit({
        election,
        precinctOrSplit: { precinct },
      }).length > 1
    );
    const layouts = await layOutBallotsAndCreateElectionDefinition(
      rendererPool,
      ballotTemplates.VxDefaultBallot,
      ballotProps,
      'vxf'
    );
    const ballots = iter(ballotProps)
      .zip(layouts.ballotContents)
      .map(([props, contents]) => ({ props, contents }))
      .toArray();

    const ballotSpecs = generateTestDeckBallots({
      election,
      precinctId: precinct.id,
      markingMethod: 'hand',
    });
    const testDeckDocument = await createPrecinctTestDeck({
      rendererPool,
      electionDefinition: layouts.electionDefinition,
      ballotSpecs,
      ballots,
    });
    await expect(testDeckDocument).toMatchPdfSnapshot();
  });

  test('for a precinct with no ballot styles', async () => {
    const fixtures = vxGeneralElectionFixtures.fixtureSpecs[0];
    const electionDefinition = (
      await readElection(fixtures.electionPath)
    ).unsafeUnwrap();

    const testDeckDocument = await createPrecinctTestDeck({
      rendererPool,
      electionDefinition,
      ballotSpecs: [],
      ballots: [], // doesn't matter
    });
    expect(testDeckDocument).toBeUndefined();
  });
});

describe('getTallyReportResults', () => {
  test('general', async () => {
    const { electionDefinition } = vxFamousNamesFixtures;
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
    const { electionDefinition } = vxPrimaryElectionFixtures;
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
  const fixtures = vxGeneralElectionFixtures.fixtureSpecs[0];
  const electionDefinition = (
    await readElection(fixtures.electionPath)
  ).unsafeUnwrap();

  const reportDocumentBuffer = await createTestDeckTallyReport({
    electionDefinition,
    generatedAtTime: new Date('2021-01-01T00:00:00.000'),
  });

  await expect(reportDocumentBuffer).toMatchPdfSnapshot({
    failureThreshold: 0.0001,
  });
});
