import { generateBallotPageLayouts } from '@votingworks/ballot-interpreter-nh';
import { assert, find } from '@votingworks/basics';
import {
  BallotMetadata,
  BallotPageLayout,
  BallotPageMetadata,
  Contests,
  Election,
  getBallotStyle,
  getContests,
} from '@votingworks/types';

/**
 * Retrieves the ballot page layouts for a ballot given a lookup array and the ballot
 * metadata to use as a key. For `gridLayouts` elections, this method generates
 * the template on the fly.
 *
 * @param ballotPageMetadata Metadata of the ballot for which you want a layout
 * @param election Current election
 */
function getBallotPageLayouts({
  ballotMetadata,
  election,
}: {
  ballotMetadata: BallotMetadata;
  election: Election;
}): BallotPageLayout[] {
  return generateBallotPageLayouts(election, ballotMetadata).unsafeUnwrap();
}

/**
 * Retrieves the ballot page layout for a ballot given a lookup array and the ballot
 * page metadata to use as a key. For `gridLayouts` elections, this method generates
 * the template on the fly.
 *
 * @param ballotPageMetadata Metadata of the ballot page for which you want a layout
 * @param election Current election
 */
export function getBallotPageLayout({
  ballotPageMetadata,
  election,
}: {
  ballotPageMetadata: BallotPageMetadata;
  election: Election;
}): BallotPageLayout {
  return find(
    getBallotPageLayouts({
      ballotMetadata: ballotPageMetadata,
      election,
    }),
    (ballotPageLayout) =>
      ballotPageLayout.metadata.pageNumber === ballotPageMetadata.pageNumber
  );
}

/**
 * Gets the contest ids for a given ballot page, specified by its metadata.
 *
 * @param ballotPageMetadata Metadata of the ballot page for which you want contest ids
 * @param election Current election
 */
export function getContestsForBallotPage({
  ballotPageMetadata,
  election,
}: {
  ballotPageMetadata: BallotPageMetadata;
  election: Election;
}): Contests {
  const layouts = getBallotPageLayouts({
    ballotMetadata: ballotPageMetadata,
    election,
  });
  let contestOffset = 0;

  for (const layout of layouts) {
    if (layout.metadata.pageNumber === ballotPageMetadata.pageNumber) {
      const ballotStyle = getBallotStyle({
        election,
        ballotStyleId: ballotPageMetadata.ballotStyleId,
      });
      assert(ballotStyle);
      const contests = getContests({
        election,
        ballotStyle,
      });

      return contests.slice(
        contestOffset,
        contestOffset + layout.contests.length
      );
    }

    contestOffset += layout.contests.length;
  }

  throw new Error(
    `unable to find page with pageNumber=${ballotPageMetadata.pageNumber}`
  );
}
