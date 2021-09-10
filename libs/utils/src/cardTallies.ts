import {
  CandidateVote,
  Contests,
  Election,
  getBallotStyle,
  getContests,
  getEitherNeitherContests,
  Tally,
  VotesDict,
  writeInCandidate,
  YesNoVote,
} from '@votingworks/types'
import { strict as assert } from 'assert'
import { map, zip } from './iterators'
import { throwIllegalValue } from './throwIllegalValue'
import {
  SerializedCandidateVoteTally,
  SerializedMsEitherNeitherTally,
  SerializedTally,
  SerializedYesNoVoteTally,
} from './types'
import { getSingleYesNoVote } from './votes'

const combineCandidateTallies = (
  tally1: SerializedCandidateVoteTally,
  tally2: SerializedCandidateVoteTally
): SerializedCandidateVoteTally => ({
  candidates: [
    ...map(
      zip(tally1.candidates, tally2.candidates),
      ([candidateTally1, candidateTally2]) => candidateTally1 + candidateTally2
    ),
  ],
  undervotes: tally1.undervotes + tally2.undervotes,
  overvotes: tally1.overvotes + tally2.overvotes,
  writeIns: tally1.writeIns + tally2.writeIns,
  ballotsCast: tally1.ballotsCast + tally2.ballotsCast,
})

const combineYesNoTallies = (
  tally1: SerializedYesNoVoteTally,
  tally2: SerializedYesNoVoteTally
): SerializedYesNoVoteTally => {
  return {
    yes: tally1.yes + tally2.yes,
    no: tally1.no + tally2.no,
    overvotes: tally1.overvotes + tally2.overvotes,
    undervotes: tally1.undervotes + tally2.undervotes,
    ballotsCast: tally1.ballotsCast + tally2.ballotsCast,
  }
}

const combineEitherNeitherTallies = (
  tally1: SerializedMsEitherNeitherTally,
  tally2: SerializedMsEitherNeitherTally
): SerializedMsEitherNeitherTally => {
  return {
    eitherOption: tally1.eitherOption + tally2.eitherOption,
    neitherOption: tally1.neitherOption + tally2.neitherOption,
    eitherNeitherUndervotes:
      tally1.eitherNeitherUndervotes + tally2.eitherNeitherUndervotes,
    eitherNeitherOvervotes:
      tally1.eitherNeitherOvervotes + tally2.eitherNeitherOvervotes,
    firstOption: tally1.firstOption + tally2.firstOption,
    secondOption: tally1.secondOption + tally2.secondOption,
    pickOneUndervotes: tally1.pickOneUndervotes + tally2.pickOneUndervotes,
    pickOneOvervotes: tally1.pickOneOvervotes + tally2.pickOneOvervotes,
    ballotsCast: tally1.ballotsCast + tally2.ballotsCast,
  }
}

export const combineTallies = (
  election: Election,
  tally1: SerializedTally,
  tally2: SerializedTally
): SerializedTally => {
  assert.strictEqual(election.contests.length, tally1.length)
  assert.strictEqual(tally1.length, tally2.length)
  const combinedTally: SerializedTally = []

  for (let i = 0; i < election.contests.length; i += 1) {
    const contest = election.contests[i]
    assert(contest)
    const tally1Row = tally1[i]
    const tally2Row = tally2[i]
    switch (contest.type) {
      case 'candidate':
        combinedTally.push(
          combineCandidateTallies(
            tally1Row as SerializedCandidateVoteTally,
            tally2Row as SerializedCandidateVoteTally
          )
        )
        break
      case 'yesno':
        combinedTally.push(
          combineYesNoTallies(
            tally1Row as SerializedYesNoVoteTally,
            tally2Row as SerializedYesNoVoteTally
          )
        )
        break
      case 'ms-either-neither':
        combinedTally.push(
          combineEitherNeitherTallies(
            tally1Row as SerializedMsEitherNeitherTally,
            tally2Row as SerializedMsEitherNeitherTally
          )
        )
        break
      default:
        throwIllegalValue(contest)
    }
  }

  return combinedTally
}

interface Params {
  election: Election
  tally: SerializedTally
  votes: VotesDict
  contests: Contests
}

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
    throwIllegalValue(contest)
  })

export const computeTallyForEitherNeitherContests = ({
  election,
  tally,
  votes,
  contests,
}: Params): SerializedTally => {
  const newTally = [...tally]

  for (const contest of getEitherNeitherContests(contests)) {
    const contestIndex = election.contests.findIndex((c) => c.id === contest.id)

    const eitherNeitherTally = {
      ...newTally[contestIndex],
    } as SerializedMsEitherNeitherTally

    const eitherNeitherVote = votes[contest.eitherNeitherContestId]
    const pickOneVote = votes[contest.pickOneContestId]

    if (eitherNeitherVote === undefined || pickOneVote === undefined) {
      continue
    }

    eitherNeitherTally.ballotsCast += 1
    // Tabulate EitherNeither section
    const singleEitherNeitherVote = getSingleYesNoVote(
      eitherNeitherVote as YesNoVote
    )
    if (eitherNeitherVote.length > 1) {
      eitherNeitherTally.eitherNeitherOvervotes += 1
    } else if (singleEitherNeitherVote === undefined) {
      eitherNeitherTally.eitherNeitherUndervotes += 1
    } else {
      eitherNeitherTally[
        singleEitherNeitherVote === 'yes' ? 'eitherOption' : 'neitherOption'
      ] += 1
    }

    // Tabulate YesNo section
    const singlePickOneVote = getSingleYesNoVote(pickOneVote as YesNoVote)

    if (pickOneVote.length > 1) {
      eitherNeitherTally.pickOneOvervotes += 1
    } else if (singlePickOneVote === undefined) {
      eitherNeitherTally.pickOneUndervotes += 1
    } else {
      eitherNeitherTally[
        singlePickOneVote === 'yes' ? 'firstOption' : 'secondOption'
      ] += 1
    }

    newTally[contestIndex] = eitherNeitherTally
  }

  return newTally
}

export const calculateTally = ({
  election,
  tally: prevTally,
  votes,
  ballotStyleId,
}: {
  election: Election
  tally: SerializedTally
  votes: VotesDict
  ballotStyleId: string
}): SerializedTally => {
  const ballotStyle = getBallotStyle({
    ballotStyleId,
    election,
  })
  assert(ballotStyle)
  const contestsForBallotStyle = getContests({
    election,
    ballotStyle,
  })
  // first update the tally for either-neither contests
  const tally = computeTallyForEitherNeitherContests({
    election,
    tally: prevTally,
    votes,
    contests: contestsForBallotStyle,
  })

  for (const contest of contestsForBallotStyle) {
    if (contest.type === 'ms-either-neither') {
      continue
    }

    const contestIndex = election.contests.findIndex((c) => c.id === contest.id)
    /* istanbul ignore next */
    if (contestIndex < 0) {
      throw new Error(`No contest found for contestId: ${contest.id}`)
    }
    const contestTally = tally[contestIndex]
    /* istanbul ignore else */
    if (contest.type === 'yesno') {
      const yesnoContestTally = contestTally as SerializedYesNoVoteTally
      const vote = votes[contest.id] as YesNoVote
      if (vote && vote.length > 1) {
        yesnoContestTally.overvotes += 1
      } else {
        const yesnoVote = getSingleYesNoVote(vote)
        if (yesnoVote === undefined) {
          yesnoContestTally.undervotes += 1
        } else {
          yesnoContestTally[yesnoVote] += 1
        }
      }
      yesnoContestTally.ballotsCast += 1
    } else if (contest.type === 'candidate') {
      const candidateContestTally = contestTally as SerializedCandidateVoteTally
      const vote = (votes[contest.id] ?? []) as CandidateVote
      if (vote.length <= contest.seats) {
        vote.forEach((candidate) => {
          if (candidate.isWriteIn) {
            candidateContestTally.writeIns += 1
          } else {
            const candidateIndex = contest.candidates.findIndex(
              (c) => c.id === candidate.id
            )
            if (
              candidateIndex < 0 ||
              candidateIndex >= candidateContestTally.candidates.length
            ) {
              throw new Error(
                `unable to find a candidate with id: ${candidate.id}`
              )
            }
            candidateContestTally.candidates[candidateIndex] += 1
          }
        })
      }
      if (vote.length < contest.seats) {
        candidateContestTally.undervotes += contest.seats - vote.length
      } else if (vote.length > contest.seats) {
        candidateContestTally.overvotes += contest.seats
      }
      candidateContestTally.ballotsCast += 1
    }
  }
  return tally
}

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
    throwIllegalValue(contest)
  })
}
