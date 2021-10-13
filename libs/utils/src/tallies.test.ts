import { electionSample } from '@votingworks/fixtures'
import { strict as assert } from 'assert'
import { ContestTally } from '@votingworks/types'
import { tallyVotesByContest } from './votes'
import { combineContestTallies } from './tallies'

test('combineContestTallies adds tallies together', () => {
  const contestZeroTallies = tallyVotesByContest({
    election: electionSample,
    votes: [],
  })
  for (const contest of electionSample.contests) {
    const contestZeroTally = contestZeroTallies[contest.id]
    assert(contestZeroTally)
    // 0 + 0 = 0
    expect(combineContestTallies(contestZeroTally, contestZeroTally)).toEqual(
      contestZeroTally
    )
    const contestUndefinedTally: ContestTally = {
      contest: contestZeroTally.contest,
      metadata: contestZeroTally.metadata,
      tallies: {},
    }
    // 0 + undefined = 0
    expect(
      combineContestTallies(contestZeroTally, contestUndefinedTally)
    ).toEqual(contestZeroTally)
  }
})
