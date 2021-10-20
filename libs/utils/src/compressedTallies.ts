import {
  AnyContest,
  ContestOptionTally,
  ContestTally,
  Dictionary,
  Election,
  expandEitherNeitherContests,
  Tally,
  writeInCandidate,
  CompressedTally,
  VotingMethod,
} from '@votingworks/types';
import { strict as assert } from 'assert';
import { BallotCountDetails } from '.';
import { throwIllegalValue } from './throwIllegalValue';
import { filterContestTalliesByPartyId } from './votes';

const ALL_PRECINCTS = '__ALL_PRECINCTS';

export function getTallyIdentifier(
  partyId?: string,
  precinctId: string = ALL_PRECINCTS
): string {
  return `${partyId},${precinctId}`;
}

/**
 * A compressed tally
 */
export function compressTally(
  election: Election,
  tally: Tally
): CompressedTally {
  // eslint-disable-next-line array-callback-return
  return election.contests.map((contest) => {
    switch (contest.type) {
      case 'yesno': {
        const contestTally = tally.contestTallies[contest.id];
        return [
          contestTally?.metadata.undervotes ?? 0, // undervotes
          contestTally?.metadata.overvotes ?? 0, // overvotes
          contestTally?.metadata.ballots ?? 0, // ballots cast
          contestTally?.tallies.yes?.tally ?? 0, // yes
          contestTally?.tallies.no?.tally ?? 0, // no
        ];
      }

      case 'ms-either-neither': {
        const eitherNeitherContestTally =
          tally.contestTallies[contest.eitherNeitherContestId];
        const pickOneContestTally =
          tally.contestTallies[contest.pickOneContestId];
        return [
          eitherNeitherContestTally?.tallies.yes?.tally ?? 0, // eitherOption
          eitherNeitherContestTally?.tallies.no?.tally ?? 0, // neitherOption
          eitherNeitherContestTally?.metadata.undervotes ?? 0, // eitherNeitherUndervotes
          eitherNeitherContestTally?.metadata.overvotes ?? 0, // eitherNeitherOvervotes
          pickOneContestTally?.tallies.yes?.tally ?? 0, // firstOption
          pickOneContestTally?.tallies.no?.tally ?? 0, // secondOption
          pickOneContestTally?.metadata.undervotes ?? 0, // pickOneUndervotes
          pickOneContestTally?.metadata.overvotes ?? 0, // pickOneOvervotes
          pickOneContestTally?.metadata.ballots ?? 0, // ballotsCast
        ];
      }

      case 'candidate': {
        const contestTally = tally.contestTallies[contest.id];
        return [
          contestTally?.metadata.undervotes ?? 0, // undervotes
          contestTally?.metadata.overvotes ?? 0, // overvotes
          contestTally?.metadata.ballots ?? 0, // ballotsCast
          ...contest.candidates.map(
            (candidate) => contestTally?.tallies[candidate.id]?.tally ?? 0
          ),
          contestTally?.tallies[writeInCandidate.id]?.tally ?? 0, // writeIns
        ];
      }

      /* istanbul ignore next - compile time check for completeness */
      default:
        throwIllegalValue(contest, 'type');
    }
  });
}

function getContestTalliesForCompressedContest(
  contest: AnyContest,
  compressedContest: number[]
): ContestTally[] {
  switch (contest.type) {
    case 'yesno': {
      const [undervotes, overvotes, ballots, yes, no] = compressedContest;
      assert(
        undervotes !== undefined &&
          overvotes !== undefined &&
          ballots !== undefined &&
          yes !== undefined &&
          no !== undefined
      );
      return [
        {
          contest,
          tallies: {
            yes: { option: ['yes'], tally: yes },
            no: { option: ['no'], tally: no },
          },
          metadata: {
            undervotes,
            overvotes,
            ballots,
          },
        },
      ];
    }
    case 'candidate': {
      const [undervotes, overvotes, ballots, ...tallyByCandidate] =
        compressedContest;
      assert(
        undervotes !== undefined &&
          overvotes !== undefined &&
          ballots !== undefined
      );
      const candidateTallies: Dictionary<ContestOptionTally> = {};
      for (const [candidateIdx, candidate] of contest.candidates.entries()) {
        const tally = tallyByCandidate[candidateIdx]; // We add 3 here to offset from the undervotes, overvotes and total ballots
        assert(tally !== undefined);
        candidateTallies[candidate.id] = {
          option: candidate,
          tally,
        };
      }
      if (contest.allowWriteIns) {
        // write ins will be the last thing in the array after the metadata (3 items) and all candidates
        const writeInTally = tallyByCandidate.pop();
        assert(writeInTally !== undefined);
        candidateTallies[writeInCandidate.id] = {
          option: writeInCandidate,
          tally: writeInTally,
        };
      }
      return [
        {
          contest,
          tallies: candidateTallies,
          metadata: {
            undervotes,
            overvotes,
            ballots,
          },
        },
      ];
    }
    case 'ms-either-neither': {
      const [
        eitherOption,
        neitherOption,
        eitherNeitherUndervotes,
        eitherNeitherOvervotes,
        firstOption,
        secondOption,
        pickOneUndervotes,
        pickOneOvervotes,
        ballots,
      ] = compressedContest;
      assert(
        eitherOption !== undefined &&
          neitherOption !== undefined &&
          eitherNeitherUndervotes !== undefined &&
          eitherNeitherOvervotes !== undefined &&
          firstOption !== undefined &&
          secondOption !== undefined &&
          pickOneUndervotes !== undefined &&
          pickOneOvervotes !== undefined &&
          ballots !== undefined
      );
      const newYesNoContests = expandEitherNeitherContests([contest]);
      return newYesNoContests.map((yesno) => {
        assert(yesno.type === 'yesno');
        return yesno.id === contest.eitherNeitherContestId
          ? {
              contest: yesno,
              tallies: {
                yes: {
                  option: ['yes'],
                  tally: eitherOption,
                },
                no: {
                  option: ['no'],
                  tally: neitherOption,
                },
              },
              metadata: {
                undervotes: eitherNeitherUndervotes,
                overvotes: eitherNeitherOvervotes,
                ballots,
              },
            }
          : {
              contest: yesno,
              tallies: {
                yes: {
                  option: ['yes'],
                  tally: firstOption,
                },
                no: {
                  option: ['no'],
                  tally: secondOption,
                },
              },
              metadata: {
                undervotes: pickOneUndervotes,
                overvotes: pickOneOvervotes,
                ballots,
              },
            };
      });
    }
    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(contest, 'type');
  }
}

export function readCompressedTally(
  election: Election,
  serializedTally: CompressedTally,
  ballotCounts: BallotCountDetails,
  partyId?: string
): Tally {
  let contestTallies: Dictionary<ContestTally> = {};
  for (const [contestIdx, contest] of election.contests.entries()) {
    const serializedContestTally = serializedTally[contestIdx];
    assert(serializedContestTally);
    const tallies = getContestTalliesForCompressedContest(
      contest,
      serializedContestTally
    );
    for (const tally of tallies) {
      contestTallies[tally.contest.id] = tally;
    }
  }

  if (partyId) {
    contestTallies = filterContestTalliesByPartyId(
      election,
      contestTallies,
      partyId
    );
  }
  return {
    numberOfBallotsCounted: ballotCounts.reduce(
      (prev, value) => prev + value,
      0
    ),
    castVoteRecords: new Set(),
    contestTallies,
    ballotCountsByVotingMethod: {
      [VotingMethod.Precinct]: ballotCounts[0],
      [VotingMethod.Absentee]: ballotCounts[1],
    },
  };
}
