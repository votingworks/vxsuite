import {
  AnyContest,
  CVR,
  ContestId,
  ContestOptionId,
  Dictionary,
  Election,
} from '@votingworks/types';
import { assert, find, iter, typedAs } from '@votingworks/basics';
import {
  BallotStyleSheetCount,
  SimpleContestTally,
  SimpleTally,
  VoteRecord,
} from '../types';
import { Store } from '../store';
import { getPerformanceTimer } from '../../test/timer';

/**
 *
 */
export function convertCastVoteRecordVotesToVoteRecords(
  cvrSnapshot: CVR.CVRSnapshot,
  contestVotesAllowedMap: Dictionary<number>
): VoteRecord[] {
  const voteRecords: VoteRecord[] = [];
  for (const cvrContest of cvrSnapshot.CVRContest) {
    const votesAllowed = contestVotesAllowedMap[cvrContest.ContestId];
    assert(votesAllowed !== undefined);
    const overvoted = cvrContest.Overvotes && cvrContest.Overvotes > 0;

    let recordIndex = 0;
    for (const cvrContestSelection of cvrContest.CVRContestSelection) {
      // We assume every contest selection has only one selection position,
      // which is true for standard voting but is not be true for ranked choice
      assert(cvrContestSelection.SelectionPosition.length === 1);
      const selectionPosition = cvrContestSelection.SelectionPosition[0];
      assert(selectionPosition);

      if (selectionPosition.HasIndication === CVR.IndicationStatus.Yes) {
        voteRecords.push({
          contestId: cvrContest.ContestId,
          optionId: cvrContestSelection.ContestSelectionId,
          type: !overvoted
            ? 'valid'
            : recordIndex < votesAllowed
            ? 'overvote'
            : 'overflow-overvote',
        });
      }
      recordIndex += 1;
    }
  }

  return voteRecords;
}

function getBallotSheetCountByContestId(
  ballotStyleSheetCounts: BallotStyleSheetCount[],
  election: Election
): Dictionary<number> {
  const contestsByDistrictId: Dictionary<AnyContest[]> = {};
  for (const contest of election.contests) {
    const existingContestIds = contestsByDistrictId[contest.districtId];
    contestsByDistrictId[contest.districtId] = existingContestIds
      ? [...existingContestIds, contest]
      : [contest];
  }

  const contestsByBallotStyleId: Dictionary<AnyContest[]> = {};
  for (const ballotStyle of election.ballotStyles) {
    const ballotStyleContests: AnyContest[] = [];
    for (const districtId of ballotStyle.districts) {
      const partyMatchingContests = (
        contestsByDistrictId[districtId] ?? []
      ).filter(
        (contest) =>
          contest.type === 'yesno' ||
          !contest.partyId ||
          contest.partyId === ballotStyle.partyId
      );
      ballotStyleContests.push(...partyMatchingContests);
    }
    contestsByBallotStyleId[ballotStyle.id] = ballotStyleContests;
  }

  const ballotSheetCountByContestId: Dictionary<number> = {};
  for (const ballotStyleSheetCount of ballotStyleSheetCounts) {
    const contestIds = (
      contestsByBallotStyleId[ballotStyleSheetCount.ballotStyleId] ?? []
    ).map(({ id }) => id);
    for (const contestId of contestIds) {
      ballotSheetCountByContestId[contestId] =
        (ballotSheetCountByContestId[contestId] ?? 0) +
        ballotStyleSheetCount.count;
    }
  }

  return ballotSheetCountByContestId;
}

/**
 * Not supporting filtering, tied to one filter for demo.
 */
export function getExampleTally(store: Store): SimpleTally {
  const timer = getPerformanceTimer();
  timer.checkpoint('enter getExampleTally');
  const currentElectionId = store.getCurrentElectionId();
  assert(currentElectionId !== undefined);
  const election =
    store.getElection(currentElectionId)?.electionDefinition.election;
  assert(election);

  const ballotSheetCountByContestId = getBallotSheetCountByContestId(
    store.getBallotStyleSheetCounts(),
    election
  );

  timer.checkpoint('got ballot sheet counts');

  const allContestOptionVoteCounts = store.getContestOptionVoteCounts();

  timer.checkpoint('got vote counts');

  const contestOptionVoteCountsByContestId = iter(
    allContestOptionVoteCounts
  ).toMap(({ contestId }) => contestId);

  const contestTallies: Record<ContestId, SimpleContestTally> = {};
  for (const [
    contestId,
    contestOptionVoteCounts,
  ] of contestOptionVoteCountsByContestId.entries()) {
    const ballotSheetCount = ballotSheetCountByContestId[contestId] ?? 0;
    const optionTallies: Record<ContestOptionId, number> = {};
    let totalOvervoteCount = 0;
    let totalValidVoteCount = 0;
    for (const contestOptionVoteCount of contestOptionVoteCounts) {
      optionTallies[contestOptionVoteCount.optionId] =
        contestOptionVoteCount.validVoteCount;
      totalValidVoteCount += contestOptionVoteCount.validVoteCount;
      totalOvervoteCount += contestOptionVoteCount.overvoteCount;
    }

    const contest = find(
      election.contests,
      (curContest) => curContest.id === contestId
    );
    const selectionsPossible = contest.type === 'candidate' ? contest.seats : 1;
    const totalPossibleSelections = ballotSheetCount * selectionsPossible;

    const totalUndervoteCount =
      totalPossibleSelections - totalValidVoteCount - totalOvervoteCount;

    contestTallies[contestId] = typedAs<SimpleContestTally>({
      optionTallies,
      metadata: {
        undervotes: totalUndervoteCount,
        overvotes: totalOvervoteCount,
        ballotSheetsCounted: ballotSheetCount,
      },
    });
  }

  timer.checkpoint('formatted');
  timer.end();
  return {
    contestTallies,
    cardCounts: [], // skip for demo
  };
}
