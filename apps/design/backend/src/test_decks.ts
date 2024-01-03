import { assert, find, uniqueBy } from '@votingworks/basics';
import { BallotLayout, Document, markBallot } from '@votingworks/hmpb-layout';
import {
  Admin,
  BallotStyleId,
  ContestId,
  Election,
  ElectionDefinition,
  PrecinctId,
  Tabulation,
} from '@votingworks/types';
import {
  combineElectionResults,
  convertVotesDictToTabulationVotes,
  filterVotesByContestIds,
  generateTestDeckBallots,
  getBallotStyleIdPartyIdLookup,
  groupMapToGroupList,
  tabulateCastVoteRecords,
  TestDeckBallot as TestDeckBallotSpec,
} from '@votingworks/utils';
import { renderToPdf } from '@votingworks/printing';
import { Buffer } from 'buffer';
import { AdminTallyReportByParty } from '@votingworks/ui';

function concatenateDocuments(documents: Document[]): Document {
  assert(documents.length > 0);
  const { width, height } = documents[0];
  assert(
    documents.every(
      (document) => document.width === width && document.height === height
    )
  );
  return {
    width,
    height,
    pages: documents.flatMap((document) => document.pages),
  };
}

/**
 * Creates a test deck for a precinct that includes:
 * - Pre-voted ballots that cover all contest options
 * - 2 blank ballots
 * - 1 overvoted ballot
 *
 * The test deck is one long document (intended to be rendered as a single PDF).
 */
export function createPrecinctTestDeck({
  election,
  precinctId,
  ballots,
}: {
  election: Election;
  precinctId: PrecinctId;
  ballots: BallotLayout[];
}): Document | undefined {
  const ballotSpecs = generateTestDeckBallots({
    election,
    precinctId,
    markingMethod: 'hand',
  });
  if (ballotSpecs.length === 0) {
    return undefined;
  }
  const markedBallots = ballotSpecs.map((ballotSpec) => {
    const { document } = find(
      ballots,
      (ballot) =>
        ballot.gridLayout.ballotStyleId === ballotSpec.ballotStyleId &&
        ballot.precinctId === ballotSpec.precinctId
    );
    return markBallot({ ballot: document, votes: ballotSpec.votes });
  });
  return concatenateDocuments(markedBallots);
}

/**
 * In order to generate CVRs per sheet, we want to know how contests are
 * arranged by sheet so we can arrange the votes accordingly.
 */
interface BallotContestLayout {
  precinctId: PrecinctId;
  ballotStyleId: BallotStyleId;
  contestIdsBySheet: Array<ContestId[]>;
}

function getBallotContestLayouts(
  ballots: BallotLayout[]
): BallotContestLayout[] {
  return ballots.map((ballot) => {
    const { precinctId, gridLayout } = ballot;
    const { ballotStyleId } = gridLayout;
    const numSheets = Math.max(
      ...gridLayout.gridPositions.map((gp) => gp.sheetNumber)
    );
    const contestIdsBySheet: BallotContestLayout['contestIdsBySheet'] =
      Array.from({
        length: numSheets,
      }).map(() => []);
    const oneContestOptionPerContest = uniqueBy(
      gridLayout.gridPositions,
      ({ contestId }) => contestId
    );
    for (const contestOption of oneContestOptionPerContest) {
      const { contestId } = contestOption;
      const { sheetNumber } = contestOption;
      contestIdsBySheet[sheetNumber - 1].push(contestId);
    }
    return {
      precinctId,
      ballotStyleId,
      contestIdsBySheet,
    };
  });
}

function generateTestDeckCastVoteRecords({
  election,
  ballots,
}: {
  election: Election;
  ballots: BallotLayout[];
}): Tabulation.CastVoteRecord[] {
  const ballotSpecs: TestDeckBallotSpec[] = generateTestDeckBallots({
    election,
    markingMethod: 'hand',
    includeBlankBallots: false,
    includeOvervotedBallots: false,
  });

  const ballotContestLayouts: BallotContestLayout[] =
    getBallotContestLayouts(ballots);

  const ballotStyleIdPartyIdLookup = getBallotStyleIdPartyIdLookup(election);

  const cvrs: Tabulation.CastVoteRecord[] = [];
  for (const ballotSpec of ballotSpecs) {
    const CVR_ATTRIBUTES = {
      precinctId: ballotSpec.precinctId,
      ballotStyleId: ballotSpec.ballotStyleId,
      partyId: ballotStyleIdPartyIdLookup[ballotSpec.ballotStyleId],
      scannerId: 'test-deck',
      batchId: 'test-deck',
      votingMethod: 'precinct',
    } as const;

    // test decks do not currently include BMD ballots
    assert(ballotSpec.markingMethod === 'hand');

    const ballotContestLayout = find(
      ballotContestLayouts,
      ({ precinctId, ballotStyleId }) =>
        ballotStyleId === ballotSpec.ballotStyleId &&
        precinctId === ballotSpec.precinctId
    );

    // HMPB ballots may be multiple sheets, so generate a CVR for each sheet
    for (const [
      sheetZeroIndex,
      sheetContestIds,
    ] of ballotContestLayout.contestIdsBySheet.entries()) {
      cvrs.push({
        votes: filterVotesByContestIds({
          votes: convertVotesDictToTabulationVotes(ballotSpec.votes),
          contestIds: sheetContestIds,
        }),
        card: { type: 'hmpb', sheetNumber: sheetZeroIndex + 1 },
        ...CVR_ATTRIBUTES,
      });
    }
  }

  return cvrs;
}

export async function getTallyReportResults({
  election,
  ballots,
}: {
  election: Election;
  ballots: BallotLayout[];
}): Promise<Admin.TallyReportResults> {
  const cvrs = generateTestDeckCastVoteRecords({
    election,
    ballots,
  });

  if (election.type === 'general') {
    const [electionResults] = groupMapToGroupList(
      await tabulateCastVoteRecords({
        election,
        cvrs,
      })
    );

    return {
      hasPartySplits: false,
      contestIds: election.contests.map(({ id }) => id),
      scannedResults: electionResults,
      cardCounts: electionResults.cardCounts,
    };
  }

  // for primaries, we need to get card counts split by party
  const electionResultsByParty = groupMapToGroupList(
    await tabulateCastVoteRecords({
      election,
      groupBy: { groupByParty: true },
      cvrs,
    })
  );

  const electionResults = combineElectionResults({
    election,
    allElectionResults: electionResultsByParty,
  });
  const cardCountsByParty: Admin.CardCountsByParty = {};
  for (const partyElectionResults of electionResultsByParty) {
    const { partyId } = partyElectionResults;
    assert(partyId !== undefined);
    cardCountsByParty[partyId] = partyElectionResults.cardCounts;
  }

  return {
    hasPartySplits: true,
    cardCountsByParty,
    scannedResults: electionResults,
    contestIds: election.contests.map(({ id }) => id),
  };
}

/**
 * Returns a PDF of the test deck tally report as a buffer.
 */
export async function createTestDeckTallyReport({
  electionDefinition,
  ballots,
  generatedAtTime,
}: {
  electionDefinition: ElectionDefinition;
  ballots: BallotLayout[];
  generatedAtTime?: Date;
}): Promise<Buffer> {
  const { election } = electionDefinition;

  const tallyReportResults = await getTallyReportResults({
    election,
    ballots,
  });

  return await renderToPdf(
    AdminTallyReportByParty({
      electionDefinition,
      title: undefined,
      isOfficial: false,
      isTest: true,
      isForLogicAndAccuracyTesting: true,
      testId: 'full-test-deck-tally-report',
      tallyReportResults,
      generatedAtTime: generatedAtTime ?? new Date(),
    })
  );
}

export const FULL_TEST_DECK_TALLY_REPORT_FILE_NAME =
  'full-test-deck-tally-report.pdf';
