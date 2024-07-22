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
  ContestId,
} from '@votingworks/types';

/**
 * A test deck ballot with votes for each contest.
 */
export interface TestDeckBallot {
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  markingMethod: 'hand' | 'machine';
  votes: VotesDict;
}

/**
 * Determines the number of positions on a ballot for a contest.
 */
export function numBallotPositions(contest: AnyContest): number {
  if (contest.type === 'candidate') {
    return (
      contest.candidates.length + (contest.allowWriteIns ? contest.seats : 0)
    );
  }
  return 2;
}

/**
 * Generates a write-in candidate for a test deck.
 */
export function generateTestDeckWriteIn(index: number): WriteInCandidate {
  return {
    id: 'write-in',
    isWriteIn: true,
    name: 'WRITE-IN',
    writeInIndex: index,
  };
}

/**
 * Gets the candidate at a given position on a test deck ballot.
 */
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
  ballotStyleId?: BallotStyleId;
  precinctId?: PrecinctId;
  markingMethod: TestDeckBallot['markingMethod'];
  includeOvervotedBallots?: boolean;
  includeBlankBallots?: boolean;
}

/**
 * Generates a set of test deck ballots for a given election, ballot style, and
 * precinct.
 */
export function generateTestDeckBallots({
  election,
  ballotStyleId,
  precinctId,
  markingMethod,
  includeOvervotedBallots = true,
  includeBlankBallots = true,
}: GenerateTestDeckParams): TestDeckBallot[] {
  const usedOptionsByContest = new Map<ContestId, Set<string>>();

  const ballotStyles = ballotStyleId
    ? [ballotStyleId]
    : election.ballotStyles.map((bs) => bs.id);
  const precincts: string[] = precinctId
    ? [precinctId]
    : election.precincts.map((p) => p.id);

  const ballots: TestDeckBallot[] = [];

  for (const currentPrecinctId of precincts) {
    const precinct = find(
      election.precincts,
      (p) => p.id === currentPrecinctId
    );
    const precinctBallotStyles = election.ballotStyles.filter(
      (bs) => bs.precincts.includes(precinct.id) && ballotStyles.includes(bs.id)
    );

    for (const ballotStyle of precinctBallotStyles) {
      const contests = getContests({ election, ballotStyle });

      const numBallots = Math.max(
        ...contests.map((c) => numBallotPositions(c))
      );

      for (let ballotNum = 0; ballotNum < numBallots; ballotNum += 1) {
        const votes: VotesDict = {};
        for (const contest of contests) {
          const usedOptions = usedOptionsByContest.get(contest.id) ?? new Set();
          usedOptionsByContest.set(contest.id, usedOptions);

          if (contest.type === 'yesno') {
            const optionId =
              ballotNum % 2 === 0 ? contest.yesOption.id : contest.noOption.id;
            if (!usedOptions.has(optionId)) {
              votes[contest.id] = [optionId];
              usedOptions.add(optionId);
            }
          } else if (
            contest.type === 'candidate' &&
            numBallotPositions(contest) > 0 // safety check
          ) {
            const choiceIndex = ballotNum % numBallotPositions(contest);
            const candidate = getTestDeckCandidateAtIndex(contest, choiceIndex);
            const key = candidate.isWriteIn
              ? `write-in-${candidate.writeInIndex}`
              : candidate.id;

            if (!usedOptions.has(key)) {
              votes[contest.id] = [candidate];
              usedOptions.add(key);
            }
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
