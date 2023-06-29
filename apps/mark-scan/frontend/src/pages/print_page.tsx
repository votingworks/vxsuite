import { useContext } from 'react';
import { PrintPage as MarkFlowPrintPage } from '@votingworks/mark-flow-ui';
import { assert } from '@votingworks/basics';
import { BallotContext } from '../contexts/ballot_context';

export function PrintPage(): JSX.Element {
  const {
    electionDefinition,
    ballotStyleId,
    precinctId,
    isLiveMode,
    votes,
    generateBallotId,
    updateTally,
    resetBallot,
  } = useContext(BallotContext);
  assert(electionDefinition, 'electionDefinition is not defined');
  assert(typeof ballotStyleId === 'string', 'ballotStyleId is not defined');
  assert(typeof precinctId === 'string', 'precinctId is not defined');

  return (
    <MarkFlowPrintPage
      electionDefinition={electionDefinition}
      ballotStyleId={ballotStyleId}
      precinctId={precinctId}
      isLiveMode={isLiveMode}
      votes={votes}
      generateBallotId={generateBallotId}
      updateTally={updateTally}
      resetBallot={resetBallot}
    />
  );
}
