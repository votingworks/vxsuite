import { assert, assertDefined, find, uniqueBy } from '@votingworks/basics';
import {
  Admin,
  BallotStyleId,
  ContestId,
  Election,
  GridLayout,
  PrecinctId,
  Tabulation,
  getGroupIdFromBallotStyleId,
} from '@votingworks/types';
import { generateTestDeckBallots, TestDeckBallot } from './test_deck_ballots';
import {
  convertVotesDictToTabulationVotes,
  filterVotesByContestIds,
} from './tabulation/convert';
import { singlePrecinctSelectionFor } from './precinct_selection';
import {
  getBallotStyleIdPartyIdLookup,
  tabulateCastVoteRecords,
  combineElectionResults,
} from './tabulation/tabulation';
import { getContestsForPrecinctAndElection } from './tabulation/contest_filtering';
import { groupMapToGroupList } from './tabulation/transformations';

interface BallotContestLayout {
  ballotStyleId: BallotStyleId;
  contestIdsBySheet: Array<ContestId[]>;
}

function getBallotContestLayouts(
  gridLayouts: readonly GridLayout[]
): BallotContestLayout[] {
  return gridLayouts.map((gridLayout) => {
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
      assertDefined(contestIdsBySheet[contestOption.sheetNumber - 1]).push(
        contestOption.contestId
      );
    }
    return {
      ballotStyleId,
      contestIdsBySheet,
    };
  });
}

export function generateTestDeckCastVoteRecords(
  election: Election,
  options: { includeSummaryBallots: boolean }
): Tabulation.CastVoteRecord[] {
  const { includeSummaryBallots = false } = options;

  // Generate HMPB ballot specs
  const hmpbBallotSpecs: TestDeckBallot[] = generateTestDeckBallots({
    election,
    ballotFormat: 'bubble',
    includeBlankBallots: false,
    includeOvervotedBallots: false,
  });

  // Generate summary ballot specs if configured
  const summaryBallotSpecs: TestDeckBallot[] = includeSummaryBallots
    ? generateTestDeckBallots({
        election,
        ballotFormat: 'summary',
        includeBlankBallots: false,
        includeOvervotedBallots: false,
      })
    : [];

  const ballotContestLayouts: BallotContestLayout[] = getBallotContestLayouts(
    assertDefined(election.gridLayouts)
  );

  const ballotStyleIdPartyIdLookup = getBallotStyleIdPartyIdLookup(election);

  const cvrs: Tabulation.CastVoteRecord[] = [];

  // Process HMPB ballots
  for (const ballotSpec of hmpbBallotSpecs) {
    const ballotStyleGroupId = getGroupIdFromBallotStyleId({
      ballotStyleId: ballotSpec.ballotStyleId,
      election,
    });
    const CVR_ATTRIBUTES = {
      precinctId: ballotSpec.precinctId,
      ballotStyleGroupId,
      partyId: ballotStyleIdPartyIdLookup[ballotStyleGroupId],
      scannerId: 'test-deck',
      batchId: 'test-deck',
      votingMethod: 'precinct',
    } as const;

    const ballotContestLayout = find(
      ballotContestLayouts,
      ({ ballotStyleId }) => ballotStyleId === ballotSpec.ballotStyleId
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

  // Process summary ballots
  for (const ballotSpec of summaryBallotSpecs) {
    const ballotStyleGroupId = getGroupIdFromBallotStyleId({
      ballotStyleId: ballotSpec.ballotStyleId,
      election,
    });
    const CVR_ATTRIBUTES = {
      precinctId: ballotSpec.precinctId,
      ballotStyleGroupId,
      partyId: ballotStyleIdPartyIdLookup[ballotStyleGroupId],
      scannerId: 'test-deck',
      batchId: 'test-deck',
      votingMethod: 'precinct',
    } as const;

    // Summary/BMD ballots contain all votes on a single "sheet" (the QR code)
    cvrs.push({
      votes: convertVotesDictToTabulationVotes(ballotSpec.votes),
      card: { type: 'bmd' },
      ...CVR_ATTRIBUTES,
    });
  }

  return cvrs;
}

/**
 * Builds tally report results from CVRs, optionally filtered to a specific precinct.
 */
export async function getTallyReportResults(
  election: Election,
  cvrs: Tabulation.CastVoteRecord[],
  precinctId?: PrecinctId
): Promise<Admin.TallyReportResults> {
  const contestIds = precinctId
    ? getContestsForPrecinctAndElection(
        election,
        singlePrecinctSelectionFor(precinctId)
      ).map(({ id }) => id)
    : election.contests.map(({ id }) => id);

  if (election.type === 'general') {
    const electionResults = assertDefined(
      groupMapToGroupList(
        await tabulateCastVoteRecords({
          election,
          cvrs,
        })
      )[0]
    );

    return {
      hasPartySplits: false,
      contestIds,
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
    assert(partyId !== undefined && !Tabulation.isNoPartyId(partyId));
    cardCountsByParty[partyId] = partyElectionResults.cardCounts;
  }

  return {
    hasPartySplits: true,
    cardCountsByParty,
    scannedResults: electionResults,
    contestIds,
  };
}
