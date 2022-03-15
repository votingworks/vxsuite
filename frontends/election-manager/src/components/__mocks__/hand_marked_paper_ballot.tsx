import React, { useEffect } from 'react';
import { HandMarkedPaperBallotProps } from '../hand_marked_paper_ballot';

export function HandMarkedPaperBallot({
  onRendered,
  ...rest
}: HandMarkedPaperBallotProps): JSX.Element {
  useEffect(() => {
    if (!onRendered) {
      return;
    }

    const immediate = setImmediate(() => {
      onRendered(rest);
    });
    return () => clearImmediate(immediate);
  }, [onRendered, rest]);

  const { election, ballotStyleId, precinctId } = rest;
  return (
    <div>
      <h1>Mocked HMPB</h1>
      Election: {election.title}
      <br />
      Ballot Style {ballotStyleId}, precinct {precinctId}.
    </div>
  );
}
