import { assert, assertDefined, find, iter } from '@votingworks/basics';
import {
  AnyContest,
  WriteInCandidate,
  CandidateContest,
  Candidate,
  Election,
  PrecinctId,
  getContests,
  isOpenPrimary,
  VotesDict,
  BallotStyleId,
} from '@votingworks/types';

/**
 * The type of ballot in a test deck:
 * - `bubble`: Bubble ballot (hmpb)
 * - `summary`: Summary ballot with QR-encoded votes
 */
export type TestDeckBallotFormat = 'bubble' | 'summary';

export interface TestDeckBallot {
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  ballotFormat: TestDeckBallotFormat;
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

function generateVotesForContests(
  contests: readonly AnyContest[],
  ballotNum: number
): VotesDict {
  const votes: VotesDict = {};
  for (const contest of contests) {
    if (contest.type === 'yesno') {
      votes[contest.id] =
        ballotNum % 2 === 0 ? [contest.yesOption.id] : [contest.noOption.id];
    } else if (contest.type === 'candidate' && contest.candidates.length > 0) {
      const choiceIndex = ballotNum % numBallotPositions(contest);
      votes[contest.id] = [getTestDeckCandidateAtIndex(contest, choiceIndex)];
    }
  }
  return votes;
}

/**
 * For open primaries, generates per-party ballot sets where each ballot votes
 * in only one party's partisan contests plus nonpartisan contests. Also
 * generates a crossover ballot (votes in multiple parties) and a
 * nonpartisan-only ballot.
 */
function generateOpenPrimaryBallots({
  ballots,
  contests,
  ballotStyle,
  currentPrecinctId,
  ballotFormat,
  includeOvervotedBallots,
  includeBlankBallots,
}: {
  ballots: TestDeckBallot[];
  contests: readonly AnyContest[];
  ballotStyle: { readonly id: BallotStyleId };
  currentPrecinctId: PrecinctId;
  ballotFormat: TestDeckBallotFormat;
  includeOvervotedBallots: boolean;
  includeBlankBallots: boolean;
}): void {
  const nonpartisanContests = contests.filter(
    (c) => c.type !== 'candidate' || !c.partyId
  );
  const partisanContestsByParty = new Map<string, AnyContest[]>();
  for (const contest of contests) {
    if (contest.type === 'candidate' && contest.partyId) {
      const existing = partisanContestsByParty.get(contest.partyId) ?? [];
      existing.push(contest);
      partisanContestsByParty.set(contest.partyId, existing);
    }
  }

  // Per-party ballots: vote in one party's contests + nonpartisan contests
  for (const [, partyContests] of partisanContestsByParty) {
    const contestsForBallot = [...partyContests, ...nonpartisanContests];
    const numBallots = Math.max(
      ...contestsForBallot.map((c) => numBallotPositions(c))
    );
    for (let ballotNum = 0; ballotNum < numBallots; ballotNum += 1) {
      ballots.push({
        ballotStyleId: ballotStyle.id,
        precinctId: currentPrecinctId,
        ballotFormat,
        votes: generateVotesForContests(contestsForBallot, ballotNum),
      });
    }
  }

  // Crossover ballot: vote in first contest of each party
  if (partisanContestsByParty.size >= 2) {
    const crossoverVotes: VotesDict = {};
    for (const [, partyContests] of partisanContestsByParty) {
      const firstContest = partyContests[0];
      if (
        firstContest &&
        firstContest.type === 'candidate' &&
        firstContest.candidates.length > 0
      ) {
        crossoverVotes[firstContest.id] = [
          assertDefined(firstContest.candidates[0]),
        ];
      }
    }
    ballots.push({
      ballotStyleId: ballotStyle.id,
      precinctId: currentPrecinctId,
      ballotFormat,
      votes: crossoverVotes,
    });
  }

  // Nonpartisan-only ballot: vote only in nonpartisan contests
  if (nonpartisanContests.length > 0) {
    ballots.push({
      ballotStyleId: ballotStyle.id,
      precinctId: currentPrecinctId,
      ballotFormat,
      votes: generateVotesForContests(nonpartisanContests, 0),
    });
  }

  if (ballotFormat === 'bubble') {
    if (includeOvervotedBallots) {
      const overvoteContest = contests.find(
        (contest) =>
          contest.type === 'yesno' || contest.candidates.length > contest.seats
      );
      if (overvoteContest) {
        ballots.push({
          ballotStyleId: ballotStyle.id,
          precinctId: currentPrecinctId,
          ballotFormat,
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
    }

    if (includeBlankBallots) {
      ballots.push({
        ballotStyleId: ballotStyle.id,
        precinctId: currentPrecinctId,
        ballotFormat,
        votes: {},
      });
      ballots.push({
        ballotStyleId: ballotStyle.id,
        precinctId: currentPrecinctId,
        ballotFormat,
        votes: {},
      });
    }
  }
}

interface GenerateTestDeckParams {
  election: Election;
  precinctId?: PrecinctId;
  ballotFormat: TestDeckBallotFormat;
  includeOvervotedBallots?: boolean;
  includeBlankBallots?: boolean;
}

export function generateTestDeckBallots({
  election,
  precinctId,
  ballotFormat,
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

      if (isOpenPrimary(election)) {
        generateOpenPrimaryBallots({
          ballots,
          contests,
          ballotStyle,
          currentPrecinctId,
          ballotFormat,
          includeOvervotedBallots,
          includeBlankBallots,
        });
        continue;
      }

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
          ballotFormat,
          votes,
        });
      }

      // Overvote and blank ballots only make sense for HMPB test decks
      if (ballotFormat === 'bubble') {
        if (includeOvervotedBallots) {
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
              ballotFormat,
              votes: {
                [overvoteContest.id]:
                  overvoteContest.type === 'yesno'
                    ? [
                        overvoteContest.yesOption.id,
                        overvoteContest.noOption.id,
                      ]
                    : iter(overvoteContest.candidates)
                        .take(overvoteContest.seats + 1)
                        .toArray(),
              },
            });
          }
        }

        if (includeBlankBallots) {
          ballots.push({
            ballotStyleId: ballotStyle.id,
            precinctId: currentPrecinctId,
            ballotFormat,
            votes: {},
          });
          ballots.push({
            ballotStyleId: ballotStyle.id,
            precinctId: currentPrecinctId,
            ballotFormat,
            votes: {},
          });
        }
      }
    }
  }

  return ballots;
}
