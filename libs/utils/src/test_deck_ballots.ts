import { assert, assertDefined, find, iter } from '@votingworks/basics';
import {
  AnyContest,
  WriteInCandidate,
  CandidateContest,
  Candidate,
  Election,
  PrecinctId,
  getContests,
  VotesDict,
  BallotStyleId,
} from '@votingworks/types';

export interface TestDeckBallot {
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  markingMethod: 'hand' | 'machine';
  votes: VotesDict;
}

export function numBallotPositions(contest: AnyContest): number {
  if (contest.type === 'candidate') {
    return (
      contest.candidates.length + (contest.allowWriteIns ? contest.seats : 0)
    );
  }
  return 2;
}

export function generateTestDeckWriteIn(index: number): WriteInCandidate {
  return {
    id: 'write-in',
    isWriteIn: true,
    name: 'WRITE-IN',
    writeInIndex: index,
  };
}

export function getTestDeckCandidateAtIndex(
  contest: CandidateContest,
  position: number
): Candidate {
  assert(position < numBallotPositions(contest)); // safety check
  if (position < contest.candidates.length) {
    return assertDefined(contest.candidates[position]);
  }
  return generateTestDeckWriteIn(position - contest.candidates.length);
}

interface GenerateTestDeckParams {
  election: Election;
  precinctId?: PrecinctId;
  markingMethod: TestDeckBallot['markingMethod'];
  includeOvervotedBallots?: boolean;
  includeBlankBallots?: boolean;
}

export function generateTestDeckBallots({
  election,
  precinctId,
  markingMethod,
  includeOvervotedBallots = true,
  includeBlankBallots = true,
}: GenerateTestDeckParams): TestDeckBallot[] {
  const precincts: string[] = precinctId
    ? [precinctId]
    : election.precincts.map((p) => p.id);

  const ballots: TestDeckBallot[] = [];

  for (const currentPrecinctId of precincts) {
    const precinct = find(
      election.precincts,
      (p) => p.id === currentPrecinctId
    );
    const precinctBallotStyles = election.ballotStyles.filter((bs) =>
      bs.precincts.includes(precinct.id)
    );

    for (const ballotStyle of precinctBallotStyles) {
      const contests = getContests({ election, ballotStyle });

      const numBallots = Math.max(
        ...contests.map((c) => numBallotPositions(c))
      );

      for (let ballotNum = 0; ballotNum < numBallots; ballotNum += 1) {
        const votes: VotesDict = {};
        for (const contest of contests) {
          if (contest.type === 'yesno') {
            votes[contest.id] =
              ballotNum % 2 === 0
                ? [contest.yesOption.id]
                : [contest.noOption.id];
          } else if (
            contest.type === 'candidate' &&
            contest.candidates.length > 0 // safety check
          ) {
            const choiceIndex = ballotNum % numBallotPositions(contest);
            votes[contest.id] = [
              getTestDeckCandidateAtIndex(contest, choiceIndex),
            ];
          }
        }
        ballots.push({
          ballotStyleId: ballotStyle.id,
          precinctId: currentPrecinctId,
          markingMethod,
          votes,
        });
      }

      if (includeOvervotedBallots && markingMethod === 'hand') {
        // Generates a minimally overvoted ballot - a single overvote in the
        // first contest where an overvote is possible. Does not overvote
        // candidate contests where you must select a write-in to overvote. See
        // discussion: https://github.com/votingworks/vxsuite/issues/1711.
        const overvoteContest = contests.find(
          (contest) =>
            contest.type === 'yesno' ||
            contest.candidates.length > contest.seats
        );
        if (overvoteContest) {
          ballots.push({
            ballotStyleId: ballotStyle.id,
            precinctId: currentPrecinctId,
            markingMethod,
            votes: {
              [overvoteContest.id]:
                overvoteContest.type === 'yesno'
                  ? [overvoteContest.yesOption.id, overvoteContest.noOption.id]
                  : iter(overvoteContest.candidates)
                      .take(overvoteContest.seats + 1)
                      .toArray(),
            },
          });
        }

        if (includeBlankBallots) {
          ballots.push({
            ballotStyleId: ballotStyle.id,
            precinctId: currentPrecinctId,
            markingMethod,
            votes: {},
          });
          ballots.push({
            ballotStyleId: ballotStyle.id,
            precinctId: currentPrecinctId,
            markingMethod,
            votes: {},
          });
        }
      }
    }
  }

  return ballots;
}
