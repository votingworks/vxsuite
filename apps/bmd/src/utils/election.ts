import { Election, Contest } from '@votingworks/types'
import { Tally } from '../config/types'

export const getZeroTally = (election: Election): Tally =>
  election.contests.map((contest) => {
    if (contest.type === 'yesno') {
      return { yes: 0, no: 0, undervotes: 0, ballotsCast: 0 }
    }

    if (contest.type === 'ms-either-neither') {
      return {
        eitherOption: 0,
        neitherOption: 0,
        eitherNeitherUndervotes: 0,
        firstOption: 0,
        secondOption: 0,
        pickOneUndervotes: 0,
        ballotsCast: 0,
      }
    }

    /* istanbul ignore next */
    if (contest.type === 'candidate') {
      return {
        candidates: contest.candidates.map(() => 0),
        writeIns: 0,
        undervotes: 0,
        ballotsCast: 0,
      }
    }

    /* istanbul ignore next */
    // `as Contest` is needed because TS knows 'yesno' and 'candidate' are the
    // only valid values and so infers `contest` is type `never`, and we want
    // to fail loudly in this situation.
    throw new Error(`unexpected contest type: ${(contest as Contest).type}`)
  })
