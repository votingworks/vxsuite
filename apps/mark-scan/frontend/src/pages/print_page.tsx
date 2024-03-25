import { useContext } from 'react';
import { PrintPage as MarkFlowPrintPage } from '@votingworks/mark-flow-ui';
import { assert } from '@votingworks/basics';
import { PrintOptions } from '@votingworks/types';
import { printElementToPdf } from '@votingworks/ui';
import makeDebug from 'debug';
import { Buffer } from 'buffer';
import { BallotContext } from '../contexts/ballot_context';
import { printBallot } from '../api';

const debug = makeDebug('mark-scan:print-page');
export function PrintPage(): JSX.Element | null {
  const {
    electionDefinition,
    ballotStyleId,
    precinctId,
    isLiveMode,
    votes,
    generateBallotId,
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
    const pdfData = Buffer.from(await printElementToPdf(element));
    printBallotMutation.mutate({ pdfData });
  }

  return (
    <MarkFlowPrintPage
      electionDefinition={electionDefinition}
      ballotStyleId={ballotStyleId}
      precinctId={precinctId}
      isLiveMode={isLiveMode}
      votes={votes}
      generateBallotId={generateBallotId}
      printElement={printElementToCustomPaperHandler}
      printType="vsap"
    />
  );
}
