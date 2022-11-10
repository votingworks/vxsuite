import React, { useEffect } from 'react';
import { HandMarkedPaperBallotProps } from '../hand_marked_paper_ballot';

export function HandMarkedPaperBallot({
  onRendered,
  election,
  ballotStyleId,
  precinctId,
  electionHash,
  locales,
  isAbsentee,
  ballotMode,
}: HandMarkedPaperBallotProps): JSX.Element {
  useEffect(() => {
    onRendered?.(0);
  }, [ballotStyleId, election, electionHash, locales, onRendered, precinctId]);

  return (
    <div>
      <h1>Mocked HMPB</h1>
      <p>Election: {election.title}</p>
      <p>Ballot Style: {ballotStyleId}</p>
      <p>Precinct: {precinctId}</p>
      <p>Absentee: {Boolean(isAbsentee).toString()}</p>
      <p>Ballot Mode: {ballotMode}</p>
    </div>
  );
}
