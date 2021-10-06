import {
  AnyContest,
  CandidateContest,
  ContestOptionTally,
  ContestTally,
  Dictionary,
  Election,
  expandEitherNeitherContests,
  Tally,
  writeInCandidate,
  YesNoContest,
} from '@votingworks/types'
import { strict as assert } from 'assert'
import { throwIllegalValue } from './throwIllegalValue'
import {
  CompressedTally,
  SerializedCandidateVoteTally,
  SerializedMsEitherNeitherTally,
  SerializedTally,
  SerializedYesNoVoteTally,
} from './types'

export const getZeroTally = (election: Election): SerializedTally =>
  // This rule is disabled because it's not type-aware and doesn't know that
  // `throwIllegalValue` never returns.
  // eslint-disable-next-line array-callback-return
  election.contests.map((contest) => {
    if (contest.type === 'yesno') {
      return { yes: 0, no: 0, undervotes: 0, overvotes: 0, ballotsCast: 0 }
    }

    if (contest.type === 'ms-either-neither') {
      return {
        eitherOption: 0,
        neitherOption: 0,
        eitherNeitherUndervotes: 0,
        eitherNeitherOvervotes: 0,
        firstOption: 0,
        secondOption: 0,
        pickOneUndervotes: 0,
        pickOneOvervotes: 0,
        ballotsCast: 0,
      }
    }

    /* istanbul ignore next */
    if (contest.type === 'candidate') {
      return {
        candidates: contest.candidates.map(() => 0),
        writeIns: 0,
        undervotes: 0,
        overvotes: 0,
        ballotsCast: 0,
      }
    }

    /* istanbul ignore next - compile time check for completeness */
    throwIllegalValue(contest, 'type')
  })

/**
 * Convert a Tally object into a SerializedTally object for storage.
 */
export const serializeTally = (
  election: Election,
  tally: Tally
): SerializedTally => {
  // eslint-disable-next-line array-callback-return
  return election.contests.map((contest) => {
    if (contest.type === 'yesno') {
      const contestTally = tally.contestTallies[contest.id]
      return {
        yes: contestTally?.tallies.yes?.tally ?? 0,
        no: contestTally?.tallies.no?.tally ?? 0,
        undervotes: contestTally?.metadata.undervotes ?? 0,
        overvotes: contestTally?.metadata.overvotes ?? 0,
        ballotsCast: contestTally?.metadata.ballots ?? 0,
      }
    }

    if (contest.type === 'ms-either-neither') {
      const eitherNeitherContestTally =
        tally.contestTallies[contest.eitherNeitherContestId]
      const pickOneContestTally = tally.contestTallies[contest.pickOneContestId]
      return {
        eitherOption: eitherNeitherContestTally?.tallies.yes?.tally ?? 0,
        neitherOption: eitherNeitherContestTally?.tallies.no?.tally ?? 0,
        eitherNeitherUndervotes:
          eitherNeitherContestTally?.metadata.undervotes ?? 0,
        eitherNeitherOvervotes:
          eitherNeitherContestTally?.metadata.overvotes ?? 0,
        firstOption: pickOneContestTally?.tallies.yes?.tally ?? 0,
        secondOption: pickOneContestTally?.tallies.no?.tally ?? 0,
        pickOneUndervotes: pickOneContestTally?.metadata.undervotes ?? 0,
        pickOneOvervotes: pickOneContestTally?.metadata.overvotes ?? 0,
        ballotsCast: pickOneContestTally?.metadata.ballots ?? 0,
      }
    }

    if (contest.type === 'candidate') {
      const contestTally = tally.contestTallies[contest.id]
      return {
        candidates: contest.candidates.map(
          (candidate) => contestTally?.tallies[candidate.id]?.tally ?? 0
        ),
        writeIns: contestTally?.tallies[writeInCandidate.id]?.tally ?? 0,
        undervotes: contestTally?.metadata.undervotes ?? 0,
        overvotes: contestTally?.metadata.overvotes ?? 0,
        ballotsCast: contestTally?.metadata.ballots ?? 0,
      }
    }
    /* istanbul ignore next - compile time check for completeness */
    throwIllegalValue(contest, 'type')
  })
}

/**
 * A compressed tally
 */
export const compressTally = (
  election: Election,
  tally: Tally
): CompressedTally => {
  // eslint-disable-next-line array-callback-return
  return election.contests.map((contest) => {
    if (contest.type === 'yesno') {
      const contestTally = tally.contestTallies[contest.id]
      return [
        contestTally?.metadata.undervotes ?? 0, // undervotes
        contestTally?.metadata.overvotes ?? 0, // overvotes
        contestTally?.metadata.ballots ?? 0, // ballots cast
        contestTally?.tallies.yes?.tally ?? 0, // yes
        contestTally?.tallies.no?.tally ?? 0, // no
      ]
    }

    if (contest.type === 'ms-either-neither') {
      const eitherNeitherContestTally =
        tally.contestTallies[contest.eitherNeitherContestId]
      const pickOneContestTally = tally.contestTallies[contest.pickOneContestId]
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
      ]
    }

    if (contest.type === 'candidate') {
      const contestTally = tally.contestTallies[contest.id]
      return [
        contestTally?.metadata.undervotes ?? 0, // undervotes
        contestTally?.metadata.overvotes ?? 0, // overvotes
        contestTally?.metadata.ballots ?? 0, // ballotsCast
        ...contest.candidates.map(
          (candidate) => contestTally?.tallies[candidate.id]?.tally ?? 0
        ),
        contestTally?.tallies[writeInCandidate.id]?.tally ?? 0, // writeIns
      ]
    }

    /* istanbul ignore next - compile time check for completeness */
    throwIllegalValue(contest)
  })
}

const getContestTalliesForSerializedContest = (
  contest: AnyContest,
  serializedContest:
    | SerializedCandidateVoteTally
    | SerializedYesNoVoteTally
    | SerializedMsEitherNeitherTally
): ContestTally[] => {
  switch (contest.type) {
    case 'yesno': {
      const yesNoTally = serializedContest as SerializedYesNoVoteTally
      return [
        {
          contest,
          tallies: {
            yes: { option: ['yes'], tally: yesNoTally.yes },
            no: { option: ['no'], tally: yesNoTally.no },
          },
          metadata: {
            undervotes: yesNoTally.undervotes,
            overvotes: yesNoTally.overvotes,
            ballots: yesNoTally.ballotsCast,
          },
        },
      ]
    }
    case 'candidate': {
      const candidateTally = serializedContest as SerializedCandidateVoteTally
      const candidateTallies: Dictionary<ContestOptionTally> = {}
      contest.candidates.forEach((candidate, candidateIdx) => {
        candidateTallies[candidate.id] = {
          option: candidate,
          tally: candidateTally.candidates[candidateIdx] ?? 0,
        }
      })
      if (contest.allowWriteIns) {
        candidateTallies[writeInCandidate.id] = {
          option: writeInCandidate,
          tally: candidateTally.writeIns,
        }
      }
      return [
        {
          contest,
          tallies: candidateTallies,
          metadata: {
            undervotes: candidateTally.undervotes,
            overvotes: candidateTally.overvotes,
            ballots: candidateTally.ballotsCast,
          },
        },
      ]
    }
    case 'ms-either-neither': {
      const eitherNeitherTally =
        serializedContest as SerializedMsEitherNeitherTally
      const newYesNoContests = expandEitherNeitherContests([contest])
      return newYesNoContests.map((yesno: CandidateContest | YesNoContest) => {
        assert(yesno.type === 'yesno')
        return yesno.id === contest.eitherNeitherContestId
          ? ({
              contest: yesno,
              tallies: {
                yes: {
                  option: ['yes'],
                  tally: eitherNeitherTally.eitherOption,
                },
                no: {
                  option: ['no'],
                  tally: eitherNeitherTally.neitherOption,
                },
              },
              metadata: {
                undervotes: eitherNeitherTally.eitherNeitherUndervotes,
                overvotes: eitherNeitherTally.eitherNeitherOvervotes,
                ballots: eitherNeitherTally.ballotsCast,
              },
            } as ContestTally)
          : ({
              contest: yesno,
              tallies: {
                yes: {
                  option: ['yes'],
                  tally: eitherNeitherTally.firstOption,
                },
                no: {
                  option: ['no'],
                  tally: eitherNeitherTally.secondOption,
                },
              },
              metadata: {
                undervotes: eitherNeitherTally.pickOneUndervotes,
                overvotes: eitherNeitherTally.pickOneOvervotes,
                ballots: eitherNeitherTally.ballotsCast,
              },
            } as ContestTally)
      })
    }
    default:
      throwIllegalValue(contest, 'type')
  }
}

export const readSerializedTally = (
  election: Election,
  serializedTally: SerializedTally,
  totalBallotCount: number,
  ballotCountsByVotingMethod: Dictionary<number>
): Tally => {
  const contestTallies: Dictionary<ContestTally> = {}
  election.contests.forEach((contest, contestIdx) => {
    const serializedContestTally = serializedTally[contestIdx]
    assert(serializedContestTally)
    const tallies = getContestTalliesForSerializedContest(
      contest,
      serializedContestTally
    )
    tallies.forEach((tally) => {
      contestTallies[tally.contest.id] = tally
    })
  })
  return {
    numberOfBallotsCounted: totalBallotCount,
    castVoteRecords: new Set(),
    contestTallies,
    ballotCountsByVotingMethod,
  }
}
