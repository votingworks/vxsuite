import { iter } from '@votingworks/basics';
import { BallotPageMetadata, Contests, Election } from '@votingworks/types';

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
  if (!election.gridLayouts) {
    throw new Error('election does not have grid layouts');
  }

  const layout = election.gridLayouts.find(
    ({ ballotStyleId, precinctId }) =>
      ballotStyleId === ballotPageMetadata.ballotStyleId &&
      precinctId === ballotPageMetadata.precinctId
  );

  if (!layout) {
    throw new Error(
      `unable to find layout for ballotStyleId=${ballotPageMetadata.ballotStyleId} precinctId=${ballotPageMetadata.precinctId}`
    );
  }

  const side = ballotPageMetadata.pageNumber % 2 === 0 ? 'back' : 'front';
  const contestIds = iter(layout.gridPositions)
    .filter((gridPosition) => gridPosition.side === side)
    .map((gridPosition) => gridPosition.contestId)
    .toSet();

  return election.contests.filter((contest) => contestIds.has(contest.id));
}
