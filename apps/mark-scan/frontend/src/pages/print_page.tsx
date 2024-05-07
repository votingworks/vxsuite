import React, { useContext } from 'react';
import { PrintPage as MarkFlowPrintPage } from '@votingworks/mark-flow-ui';
import { assert } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { BallotContext } from '../contexts/ballot_context';
import { printBallot } from '../api';

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
  const mutatePrintBallot = printBallot.useMutation().mutate;

  const onPdfReady = React.useCallback(
    (pdfData: Uint8Array) => {
      mutatePrintBallot({ pdfData: Buffer.from(pdfData) });
    },
    [mutatePrintBallot]
  );

  return (
    <MarkFlowPrintPage
      electionDefinition={electionDefinition}
      ballotStyleId={ballotStyleId}
      precinctId={precinctId}
      isLiveMode={isLiveMode}
      votes={votes}
      generateBallotId={generateBallotId}
      printToPdf
      onPrint={onPdfReady}
      machineType="markScan"
    />
  );
}
