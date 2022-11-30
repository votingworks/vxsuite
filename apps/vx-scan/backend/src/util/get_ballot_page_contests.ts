import { assert } from '@votingworks/utils';
import {
  BallotPageMetadata,
  Contests,
  Election,
  getBallotStyle,
  getContests,
  BallotPageLayout,
} from '@votingworks/types';

/**
 * Gets the contests that appear on a given paper ballot page.
 */
export function getBallotPageContests(
  election: Election,
  metadata: BallotPageMetadata,
  layouts: readonly BallotPageLayout[]
): Contests {
  const ballotStyle = getBallotStyle({
    election,
    ballotStyleId: metadata.ballotStyleId,
  });
  assert(ballotStyle);
  const ballotPageContestOffset = layouts
    .slice(0, metadata.pageNumber - 1)
    .reduce((count, layout) => count + layout.contests.length, 0);
  return getContests({ election, ballotStyle }).slice(
    ballotPageContestOffset,
    ballotPageContestOffset + layouts[metadata.pageNumber - 1].contests.length
  );
}
