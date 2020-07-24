import {
  Contests,
  Election,
  getBallotStyle,
  getContests,
} from '@votingworks/ballot-encoder'
import type { BallotPageMetadata } from '@votingworks/hmpb-interpreter'
import type { SerializableBallotPageLayout } from '../types'

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
  })!
  const ballotPageContestOffset = layouts
    .slice(0, metadata.pageNumber - 1)
    .reduce((count, layout) => count + layout.contests.length, 0)
  return getContests({ election, ballotStyle }).slice(
    ballotPageContestOffset,
    ballotPageContestOffset + layouts[metadata.pageNumber - 1].contests.length
  )
}
