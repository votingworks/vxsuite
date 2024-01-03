import {
  electionFamousNames2021Fixtures,
  electionGeneralDefinition,
  electionTwoPartyPrimaryDefinition,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import {
  BallotLayout,
  DEFAULT_LAYOUT_OPTIONS,
  layOutAllBallotStyles,
} from '@votingworks/hmpb-layout';
import {
  BallotType,
  ElectionDefinition,
  getContests,
} from '@votingworks/types';
import { assert, assertDefined, find, iter } from '@votingworks/basics';
import {
  buildContestResultsFixture,
  getBallotStyleById,
  getBallotStylesByPrecinctId,
  numBallotPositions,
} from '@votingworks/utils';
import { tmpNameSync } from 'tmp';
import { readFileSync, writeFileSync } from 'fs';
import {
  createPrecinctTestDeck,
  createTestDeckTallyReport,
  getTallyReportResults,
} from './test_decks';
import { pdfToPageImages } from '../test/images';

function expectedTestDeckPages(
  ballots: BallotLayout[],
  electionDefinition: ElectionDefinition
): number {
  return iter(ballots)
    .map((ballot) => {
      const { document, gridLayout } = ballot;
      const ballotStyle = getBallotStyleById(
        electionDefinition,
        gridLayout.ballotStyleId
      );
      const contests = getContests({
        election: electionDefinition.election,
        ballotStyle,
      });
      const maxContestOptions = assertDefined(
        iter(contests).map(numBallotPositions).max()
      );
      const blankBallots = 2;
      const overvotedBallots = 1;
      return (
        document.pages.length *
        (maxContestOptions + blankBallots + overvotedBallots)
      );
    })
    .sum();
}

// We test mainly that the test decks have the right number of pages, relying on
// the fact that generateTestDeckBallots is tested in
// libs/utils/src/test_deck_ballots.test.ts (ensuring we generate the ballots
// with the proper votes) and that markBallot is tested by the ballot fixtures
// in libs/hmpb/render-backend (ensuring the marks and write-ins look good) and
// corresponding interpretation tests in libs/ballot-interpreter (ensuring the
// marks and write-ins are interpreted correctly).
//
// Once ballot rendering is faster, it might be nice to also have a snapshot
// test for test deck PDFs to ensure it all comes together correctly.
describe('createPrecinctTestDeck', () => {
  test('for a precinct with one ballot style', () => {
    const electionDefinition = electionGeneralDefinition;
    const { election } = electionDefinition;
    const precinctId = election.precincts[0].id;
    assert(
      getBallotStylesByPrecinctId(electionDefinition, precinctId).length === 1
    );
    const { ballots } = layOutAllBallotStyles({
      election,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
      layoutOptions: DEFAULT_LAYOUT_OPTIONS,
    }).unsafeUnwrap();
    const testDeckDocument = createPrecinctTestDeck({
      election,
      precinctId,
      ballots,
    });
    assert(testDeckDocument);

    const precinctBallots = ballots.filter(
      (ballot) => ballot.precinctId === precinctId
    );
    assert(precinctBallots.length === 1);
    expect(testDeckDocument.pages).toHaveLength(
      expectedTestDeckPages(precinctBallots, electionDefinition)
    );
  });

  test('for a precinct with multiple ballot styles', () => {
    const electionDefinition = electionTwoPartyPrimaryDefinition;
    const { election } = electionDefinition;
    const precinctId = election.precincts[0].id;
    assert(
      getBallotStylesByPrecinctId(electionDefinition, precinctId).length > 1
    );

    const { ballots } = layOutAllBallotStyles({
      election,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
      layoutOptions: DEFAULT_LAYOUT_OPTIONS,
    }).unsafeUnwrap();
    const testDeckDocument = createPrecinctTestDeck({
      election,
      precinctId,
      ballots,
    });
    assert(testDeckDocument);

    const precinctBallots = ballots.filter(
      (ballot) => ballot.precinctId === precinctId
    );
    assert(precinctBallots.length > 1);
    expect(testDeckDocument.pages).toHaveLength(
      expectedTestDeckPages(precinctBallots, electionDefinition)
    );
  });

  test('for a precinct with no ballot styles', () => {
    const electionDefinition = electionGeneralDefinition;
    const { election } = electionDefinition;
    const precinctWithNoBallotStyles = election.precincts.find(
      (precinct) =>
        getBallotStylesByPrecinctId(electionDefinition, precinct.id).length ===
        0
    );
    assert(precinctWithNoBallotStyles);

    const testDeckDocument = createPrecinctTestDeck({
      election,
      precinctId: precinctWithNoBallotStyles.id,
      ballots: [], // doesn't matter
    });
    expect(testDeckDocument).toBeUndefined();
  });
});

describe('getTallyReportResults', () => {
  test('general', async () => {
    const { electionDefinition } = electionFamousNames2021Fixtures;
    const { election } = electionDefinition;

    const { ballots } = layOutAllBallotStyles({
      election,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
      layoutOptions: DEFAULT_LAYOUT_OPTIONS,
    }).unsafeUnwrap();

    const tallyReportResults = await getTallyReportResults({
      election,
      ballots,
    });

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
    const { electionDefinition } = electionTwoPartyPrimaryFixtures;
    const { election } = electionDefinition;

    const { ballots } = layOutAllBallotStyles({
      election,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
      layoutOptions: DEFAULT_LAYOUT_OPTIONS,
    }).unsafeUnwrap();

    const tallyReportResults = await getTallyReportResults({
      election,
      ballots,
    });

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
        hmpb: [14],
      },
      '1': {
        bmd: 0,
        hmpb: [12],
      },
    });
    const { scannedResults } = tallyReportResults;
    expect(scannedResults.cardCounts).toEqual({
      bmd: 0,
      hmpb: [26],
      manual: 0,
    });

    // check one contest
    expect(scannedResults.contestResults['best-animal-mammal']).toEqual(
      buildContestResultsFixture({
        contest: find(election.contests, (c) => c.id === 'best-animal-mammal'),
        contestResultsSummary: {
          type: 'candidate',
          ballots: 14,
          overvotes: 0,
          undervotes: 0,
          officialOptionTallies: {
            fox: 4,
            horse: 6,
            otter: 4,
          },
        },
        includeGenericWriteIn: false,
      })
    );
  });
});

test('createTestDeckTallyReport', async () => {
  const electionDefinition = electionGeneralDefinition;
  const { election } = electionDefinition;
  const { ballots } = layOutAllBallotStyles({
    election,
    ballotType: BallotType.Precinct,
    ballotMode: 'test',
    layoutOptions: DEFAULT_LAYOUT_OPTIONS,
  }).unsafeUnwrap();

  const reportDocumentBuffer = await createTestDeckTallyReport({
    electionDefinition,
    ballots,
    generatedAtTime: new Date('2021-01-01T00:00:00.000Z'),
  });
  const reportDocumentPath = tmpNameSync();
  writeFileSync(reportDocumentPath, reportDocumentBuffer);

  const imagePaths = await pdfToPageImages(reportDocumentPath);
  for (const imagePath of imagePaths) {
    const imageBuffer = readFileSync(imagePath);
    expect(imageBuffer).toMatchImageSnapshot();
  }
});
