import { useContext, useEffect, useRef } from 'react';
import { PrintPage as MarkFlowPrintPage } from '@votingworks/mark-flow-ui';
import { assert } from '@votingworks/basics';
import { BmdPaperBallot, printElement } from '@votingworks/ui';
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

  const printerTimer = useRef(0);

  async function print() {
    assert(electionDefinition);
    assert(typeof ballotStyleId !== 'undefined');
    assert(typeof precinctId !== 'undefined');

    await printElement(
      <BmdPaperBallot
        ballotStyleId={ballotStyleId}
        electionDefinition={electionDefinition}
        generateBallotId={generateBallotId}
        isLiveMode={isLiveMode}
        precinctId={precinctId}
        votes={votes}
        machineType="mark"
      />,
      { sides: 'one-sided' }
    );

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

  return <MarkFlowPrintPage print={print} />;
}
