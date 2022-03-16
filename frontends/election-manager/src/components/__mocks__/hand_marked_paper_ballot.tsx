import React, { useEffect } from 'react';
import { HandMarkedPaperBallotProps } from '../hand_marked_paper_ballot';

export function HandMarkedPaperBallot({
  onRendered,
  election,
  ballotStyleId,
  precinctId,
  electionHash,
  locales,
}: HandMarkedPaperBallotProps): JSX.Element {
  useEffect(() => {
    onRendered?.({
      election,
      ballotStyleId,
      precinctId,
      electionHash,
      locales,
    });
  }, [ballotStyleId, election, electionHash, locales, onRendered, precinctId]);

  return (
    <div>
      <h1>Mocked HMPB</h1>
      Election: {election.title}
      <br />
      Ballot Style {ballotStyleId}, precinct {precinctId}.
    </div>
  );
}
