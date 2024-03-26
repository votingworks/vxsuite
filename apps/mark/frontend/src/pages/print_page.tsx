import { useContext, useEffect, useRef } from 'react';
import { PrintPage as MarkFlowPrintPage } from '@votingworks/mark-flow-ui';
import { assert } from '@votingworks/basics';
import { BallotContext } from '../contexts/ballot_context';
import { BALLOT_PRINTING_TIMEOUT_SECONDS } from '../config/globals';

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

  const printerTimer = useRef(0);

  function onPrintStarted() {
    updateTally();
    printerTimer.current = window.setTimeout(() => {
      resetBallot(true);
    }, BALLOT_PRINTING_TIMEOUT_SECONDS * 1000);
  }

  // Make sure we clean up any pending timeout on unmount
  useEffect(() => {
    return () => {
      clearTimeout(printerTimer.current);
    };
  }, []);

  return (
    <MarkFlowPrintPage
      electionDefinition={electionDefinition}
      ballotStyleId={ballotStyleId}
      precinctId={precinctId}
      isLiveMode={isLiveMode}
      votes={votes}
      generateBallotId={generateBallotId}
      onPrintStarted={onPrintStarted}
      machineType="mark"
    />
  );
}
