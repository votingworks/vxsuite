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
 * An array in which there is an element for each ballot variant containing
 * the ballot variant's metadata and the associated page layouts. Used as a
 * lookup table to find layouts to include in cast vote records without
 * retrieving them from the scan store repeatedly.
 */
export type BallotPageLayoutsLookup = Array<{
  ballotMetadata: BallotMetadata;
  ballotPageLayouts: BallotPageLayout[];
}>;

/**
 * Retrieves the ballot page layouts for a ballot given a lookup array and the ballot
 * metadata to use as a key. For `gridLayouts` elections, this method generates
 * the template on the fly.
 *
 * @param ballotPageLayoutsLookup Layout lookup array: {@link BallotPageLayoutsLookup}
 * @param ballotPageMetadata Metadata of the ballot for which you want a layout
 * @param election Current election
 */
function getBallotPageLayouts({
  ballotMetadata,
  ballotPageLayoutsLookup,
  election,
}: {
  ballotMetadata: BallotMetadata;
  ballotPageLayoutsLookup: BallotPageLayoutsLookup;
  election: Election;
}): BallotPageLayout[] {
  let ballotPageLayouts = ballotPageLayoutsLookup.find(
    ({ ballotMetadata: lookupMetadata }) =>
      lookupMetadata.locales.primary === ballotMetadata.locales.primary &&
      lookupMetadata.locales.secondary === ballotMetadata.locales.secondary &&
      lookupMetadata.ballotStyleId === ballotMetadata.ballotStyleId &&
      lookupMetadata.precinctId === ballotMetadata.precinctId &&
      lookupMetadata.isTestMode === ballotMetadata.isTestMode
  )?.ballotPageLayouts;

  if (!ballotPageLayouts) {
    if (election.gridLayouts) {
      ballotPageLayouts = generateBallotPageLayouts(
        election,
        ballotMetadata
      ).unsafeUnwrap();
    } else {
      throw new Error('unable to find template layout for the current ballot');
    }
  }

  return ballotPageLayouts;
}

/**
 * Retrieves the ballot page layout for a ballot given a lookup array and the ballot
 * page metadata to use as a key. For `gridLayouts` elections, this method generates
 * the template on the fly.
 *
 * @param ballotPageLayoutsLookup Layout lookup array: {@link BallotPageLayoutsLookup}
 * @param ballotPageMetadata Metadata of the ballot page for which you want a layout
 * @param election Current election
 */
export function getBallotPageLayout({
  ballotPageMetadata,
  ballotPageLayoutsLookup,
  election,
}: {
  ballotPageMetadata: BallotPageMetadata;
  ballotPageLayoutsLookup: BallotPageLayoutsLookup;
  election: Election;
}): BallotPageLayout {
  return find(
    getBallotPageLayouts({
      ballotMetadata: ballotPageMetadata,
      ballotPageLayoutsLookup,
      election,
    }),
    (ballotPageLayout) =>
      ballotPageLayout.metadata.pageNumber === ballotPageMetadata.pageNumber
  );
}

/**
 * Gets the contest ids for a given ballot page, specified by its metadata.
 *
 * @param ballotPageLayoutsLookup Layout lookup array: {@link BallotPageLayoutsLookup}
 * @param ballotPageMetadata Metadata of the ballot page for which you want contest ids
 * @param election Current election
 */
export function getContestsForBallotPage({
  ballotPageMetadata,
  ballotPageLayoutsLookup,
  election,
}: {
  ballotPageMetadata: BallotPageMetadata;
  election: Election;
  ballotPageLayoutsLookup: BallotPageLayoutsLookup;
}): Contests {
  const layouts = getBallotPageLayouts({
    ballotMetadata: ballotPageMetadata,
    ballotPageLayoutsLookup,
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
