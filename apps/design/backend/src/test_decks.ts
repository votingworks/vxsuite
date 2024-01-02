import { find } from '@votingworks/basics';
import { BallotLayout, Document, markBallot } from '@votingworks/hmpb-layout';
import { Election, PrecinctId } from '@votingworks/types';
import { generateTestDeckBallots } from '@votingworks/utils';
import { assert } from 'console';

function concatenateDocuments(documents: Document[]): Document {
  assert(documents.length > 0);
  const { width, height } = documents[0];
  assert(
    documents.every(
      (document) => document.width === width && document.height === height
    )
  );
  return {
    width,
    height,
    pages: documents.flatMap((document) => document.pages),
  };
}

/**
 * Creates a test deck for a precinct that includes:
 * - Pre-voted ballots that cover all contest options
 * - 2 blank ballots
 * - 1 overvoted ballot
 *
 * The test deck is one long document (intended to be rendered as a single PDF).
 */
export function createPrecinctTestDeck({
  election,
  precinctId,
  ballots,
}: {
  election: Election;
  precinctId: PrecinctId;
  ballots: BallotLayout[];
}): Document | undefined {
  const ballotSpecs = generateTestDeckBallots({
    election,
    precinctId,
    markingMethod: 'hand',
  });
  if (ballotSpecs.length === 0) {
    return undefined;
  }
  const markedBallots = ballotSpecs.map((ballotSpec) => {
    const { document } = find(
      ballots,
      (ballot) =>
        ballot.gridLayout.ballotStyleId === ballotSpec.ballotStyleId &&
        ballot.precinctId === ballotSpec.precinctId
    );
    return markBallot({ ballot: document, votes: ballotSpec.votes });
  });
  return concatenateDocuments(markedBallots);
}
