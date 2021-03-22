/*
 * Utilities for dealing with Either Neither Questions
 */

import {
  Election,
  VotesDict,
  YesNoVote,
  getEitherNeitherContests,
  Contests,
} from '@votingworks/types'

import { Tally, MsEitherNeitherTally } from '../config/types'

import { getSingleYesNoVote } from './votes'

interface Params {
  election: Election
  tally: Tally
  votes: VotesDict
  contests: Contests
}

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
