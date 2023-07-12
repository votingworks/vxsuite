import { useContext, useEffect, useRef } from 'react';
import { PrintPage as MarkFlowPrintPage } from '@votingworks/mark-flow-ui';
import { assert } from '@votingworks/basics';
import { PrintOptions } from '@votingworks/types';
import { printElementToPdf } from '@votingworks/ui';
import makeDebug from 'debug';
import { Buffer } from 'buffer';
import { BallotContext } from '../contexts/ballot_context';
import { BALLOT_PRINTING_TIMEOUT_SECONDS } from '../config/globals';
import { printBallot } from '../api';

const debug = makeDebug('mark-scan:print-page');
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
  const printBallotMutation = printBallot.useMutation();

  async function printElementToCustomPaperHandler(
    element: JSX.Element,
    options: PrintOptions
  ): Promise<void> {
    debug(`Ignoring print options with keys: ${Object.keys(options)}`);
    const pdfData = await printElementToPdf(element);
    debug(`got pdf data length ${pdfData.byteLength}`);
    printBallotMutation.mutate({ pdfData: Buffer.from(pdfData) });
  }

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
      printElement={printElementToCustomPaperHandler}
    />
  );
}
