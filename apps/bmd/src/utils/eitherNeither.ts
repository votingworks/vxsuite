/*
 * Utilities for dealing with Either Neither Questions
 */

import {
  Contest,
  Election,
  MsEitherNeitherContest,
  YesNoVote,
  VotesDict,
  Dictionary,
} from '@votingworks/ballot-encoder'

import { Tally, MsEitherNeitherTally } from '../config/types'

import { getSingleYesNoVote } from './votes'

const getEitherNeitherContests = (
  election: Election
): MsEitherNeitherContest[] => {
  return election.contests
    .filter((c) => c.type === 'ms-either-neither')
    .map((c) => c as MsEitherNeitherContest)
}

interface Params {
  election: Election
  tally: Tally
  votes?: VotesDict
}

interface TallyAndContestIds {
  tally: Tally
  contestIds: Contest['id'][]
}

// eslint-disable-next-line import/prefer-default-export
export const computeTallyForEitherNeitherContests = ({
  election,
  tally,
  votes,
}: Params): TallyAndContestIds => {
  const newTally = [...tally]

  const contestIds: Contest['id'][] = []

  const eitherNeitherContestMappings: Dictionary<MsEitherNeitherContest> = {}
  getEitherNeitherContests(election).forEach((c) => {
    eitherNeitherContestMappings[c.eitherNeitherContestId] = c
    eitherNeitherContestMappings[c.pickOneContestId] = c
  })

  for (const contestId in votes) {
    /* istanbul ignore next */
    if (Object.prototype.hasOwnProperty.call(votes, contestId)) {
      const outerContest = eitherNeitherContestMappings[contestId]
      if (outerContest) {
        contestIds.push(contestId)
        const contestIndex = election.contests.findIndex(
          (c) => c.id === outerContest.id
        )
        const vote = votes[contestId] as YesNoVote
        const singleVote = getSingleYesNoVote(vote)

        if (singleVote) {
          // copy
          const eitherNeitherTally = {
            ...newTally[contestIndex],
          } as MsEitherNeitherTally
          newTally[contestIndex] = eitherNeitherTally

          if (outerContest.eitherNeitherContestId === contestId) {
            // special tabulation rule: if this is 'yes' but no option selected, we cancel the vote.
            if (
              singleVote === 'no' ||
              votes[outerContest.pickOneContestId]?.length === 1
            ) {
              eitherNeitherTally[
                singleVote === 'yes' ? 'eitherOption' : 'neitherOption'
              ]++
            }
          } else {
            eitherNeitherTally[
              singleVote === 'yes' ? 'firstOption' : 'secondOption'
            ]++
          }
        }
      }
    }
  }

  return {
    tally: newTally,
    contestIds,
  }
}
