import { strict as assert } from 'assert'
import {
  Contests,
  Election,
  getBallotStyle,
  getContests,
} from '@votingworks/types'
import { BallotPageMetadata } from '@votingworks/hmpb-interpreter'
import { SerializableBallotPageLayout } from '../types'

/**
 * Gets the contests that appear on a given paper ballot page.
 */
export default function getBallotPageContests(
  election: Election,
  metadata: BallotPageMetadata,
  layouts: readonly SerializableBallotPageLayout[]
): Contests {
  const ballotStyle = getBallotStyle({
    election,
    ballotStyleId: metadata.ballotStyleId,
  })
  assert(ballotStyle)
  const ballotPageContestOffset = layouts
    .slice(0, metadata.pageNumber - 1)
    .reduce((count, layout) => count + layout.contests.length, 0)
  return getContests({ election, ballotStyle }).slice(
    ballotPageContestOffset,
    ballotPageContestOffset + layouts[metadata.pageNumber - 1].contests.length
  )
}
