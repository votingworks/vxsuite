import { strict as assert } from 'assert'

import {
  CandidateVote,
  Contest,
  Contests,
  Election,
  getBallotStyle,
  getContests,
  getEitherNeitherContests,
  VotesDict,
  YesNoVote,
} from '@votingworks/types'
import {
  CandidateVoteTally,
  MsEitherNeitherTally,
  Tally,
  YesNoVoteTally,
} from './types'
import { getSingleYesNoVote } from './votes'

const combineCandidateTallies = (
  tally1: CandidateVoteTally,
  tally2: CandidateVoteTally
): CandidateVoteTally => {
  const candidates: number[] = []
  assert.strictEqual(tally1.candidates.length, tally2.candidates.length)
  for (let i = 0; i < tally1.candidates.length; i++) {
    candidates.push(tally1.candidates[i]! + tally2.candidates[i]!)
  }
  return {
    candidates,
    undervotes: tally1.undervotes + tally2.undervotes,
    overvotes: tally1.overvotes + tally2.overvotes,
    writeIns: tally1.writeIns + tally2.writeIns,
    ballotsCast: tally1.ballotsCast + tally2.ballotsCast,
  }
}

const combineYesNoTallies = (
  tally1: YesNoVoteTally,
  tally2: YesNoVoteTally
): YesNoVoteTally => {
  return {
    yes: tally1.yes + tally2.yes,
    no: tally1.no + tally2.no,
    overvotes: tally1.overvotes + tally2.overvotes,
    undervotes: tally1.undervotes + tally2.undervotes,
    ballotsCast: tally1.ballotsCast + tally2.ballotsCast,
  }
}

const combineEitherNeitherTallies = (
  tally1: MsEitherNeitherTally,
  tally2: MsEitherNeitherTally
): MsEitherNeitherTally => {
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
  tally1: Tally,
  tally2: Tally
): Tally => {
  assert.strictEqual(election.contests.length, tally1.length)
  assert.strictEqual(tally1.length, tally2.length)
  const combinedTally: Tally = []

  for (let i = 0; i < election.contests.length; i += 1) {
    const contest = election.contests[i]!
    const tally1Row = tally1[i]
    const tally2Row = tally2[i]
    switch (contest.type) {
      case 'candidate':
        combinedTally.push(
          combineCandidateTallies(
            tally1Row as CandidateVoteTally,
            tally2Row as CandidateVoteTally
          )
        )
        break
      case 'yesno':
        combinedTally.push(
          combineYesNoTallies(
            tally1Row as YesNoVoteTally,
            tally2Row as YesNoVoteTally
          )
        )
        break
      case 'ms-either-neither':
        combinedTally.push(
          combineEitherNeitherTallies(
            tally1Row as MsEitherNeitherTally,
            tally2Row as MsEitherNeitherTally
          )
        )
        break
    }
  }

  return combinedTally
}

interface Params {
  election: Election
  tally: Tally
  votes: VotesDict
  contests: Contests
}

export const getZeroTally = (election: Election): Tally =>
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

    /* istanbul ignore next */
    // `as Contest` is needed because TS knows 'yesno' and 'candidate' are the
    // only valid values and so infers `contest` is type `never`, and we want
    // to fail loudly in this situation.
    throw new Error(`unexpected contest type: ${(contest as Contest).type}`)
  })

export const computeTallyForEitherNeitherContests = ({
  election,
  tally,
  votes,
  contests,
}: Params): Tally => {
  const newTally = [...tally]

  for (const contest of getEitherNeitherContests(contests)) {
    const contestIndex = election.contests.findIndex((c) => c.id === contest.id)

    const eitherNeitherTally = {
      ...newTally[contestIndex],
    } as MsEitherNeitherTally

    eitherNeitherTally.ballotsCast++
    // Tabulate EitherNeither section
    const eitherNeitherVote = votes[contest.eitherNeitherContestId] as YesNoVote
    const singleEitherNeitherVote = getSingleYesNoVote(eitherNeitherVote)

    if (singleEitherNeitherVote === undefined) {
      eitherNeitherTally.eitherNeitherUndervotes++
    } else {
      eitherNeitherTally[
        singleEitherNeitherVote === 'yes' ? 'eitherOption' : 'neitherOption'
      ]++
    }

    // Tabulate YesNo section
    const pickOneVote = votes[contest.pickOneContestId] as YesNoVote
    const singlePickOneVote = getSingleYesNoVote(pickOneVote)

    if (singlePickOneVote === undefined) {
      eitherNeitherTally.pickOneUndervotes++
    } else {
      eitherNeitherTally[
        singlePickOneVote === 'yes' ? 'firstOption' : 'secondOption'
      ]++
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
  tally: Tally
  votes: VotesDict
  ballotStyleId: string
}): Tally => {
  const ballotStyle = getBallotStyle({
    ballotStyleId,
    election,
  })!
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
      // eslint-disable-next-line no-continue
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
      const yesnoContestTally = contestTally as YesNoVoteTally
      const vote = votes[contest.id] as YesNoVote
      if (vote && vote.length > 1) {
        yesnoContestTally.overvotes++
      } else {
        const yesnovote = getSingleYesNoVote(vote)!
        if (yesnovote === undefined) {
          yesnoContestTally.undervotes++
        } else {
          yesnoContestTally[yesnovote]++
        }
      }
      yesnoContestTally.ballotsCast++
    } else if (contest.type === 'candidate') {
      const candidateContestTally = contestTally as CandidateVoteTally
      const vote = (votes[contest.id] ?? []) as CandidateVote
      if (vote.length <= contest.seats) {
        vote.forEach((candidate) => {
          if (candidate.isWriteIn) {
            candidateContestTally.writeIns++
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
            candidateContestTally.candidates[candidateIndex]++
          }
        })
      }
      if (vote.length < contest.seats) {
        candidateContestTally.undervotes += contest.seats - vote.length
      } else if (vote.length > contest.seats) {
        candidateContestTally.overvotes += contest.seats
      }
      candidateContestTally.ballotsCast++
    }
  }
  return tally
}
