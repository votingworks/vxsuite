import { useContext } from 'react';
import { PrintPage as MarkFlowPrintPage } from '@votingworks/mark-flow-ui';
import { assert } from '@votingworks/basics';
import { PrintOptions } from '@votingworks/types';
import { printElementToPdf } from '@votingworks/ui';
import makeDebug from 'debug';
import { Buffer } from 'buffer';
import { Redirect } from 'react-router-dom';
import { BallotContext } from '../contexts/ballot_context';
import { getStateMachineState, printBallot } from '../api';

const debug = makeDebug('mark-scan:print-page');
export function PrintPage(): JSX.Element | null {
  const stateMachineStateQuery = getStateMachineState.useQuery();
  const {
    electionDefinition,
    ballotStyleId,
    precinctId,
    isLiveMode,
    votes,
    generateBallotId,
    updateTally,
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

  function onPrintStarted() {
    updateTally();
  }

  if (!stateMachineStateQuery.isSuccess) {
    return null;
  }

  if (stateMachineStateQuery.data === 'presenting_ballot') {
    return <Redirect to="/validate" />;
  }

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
