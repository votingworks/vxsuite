import React from 'react';
import { HandMarkedPaperBallotProps } from '../HandMarkedPaperBallot';

export function HandMarkedPaperBallot({
  ballotStyleId,
  election,
  precinctId,
  onRendered,
}: HandMarkedPaperBallotProps): JSX.Element {
  if (onRendered) {
    setImmediate(onRendered);
  }

  return (
    <div>
      <h1>Mocked HMPB</h1>
      Election: {election.title}
      <br />
      Ballot Style {ballotStyleId}, precinct {precinctId}.
    </div>
  );
}
