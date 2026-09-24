import React, { useContext, useState } from 'react';
import { PrintPage as MarkFlowPrintPage } from '@votingworks/mark-flow-ui';
import { assert } from '@votingworks/basics';
import {
  appStrings,
  Button,
  getPrintOutcome,
  Modal,
  P,
  useCurrentLanguage,
} from '@votingworks/ui';
import { BallotContext } from '../contexts/ballot_context.js';
import { getPrintJobStatus, printBallot } from '../api.js';

export function PrintPage(): JSX.Element {
  const {
    ballotStyleId,
    precinctId,
    votes,
    endVoterSession,
    resetBallot,
    hasPrintedBallot,
    setHasPrintedBallot,
    printJobId,
    setPrintJobId,
  } = useContext(BallotContext);
  const languageCode = useCurrentLanguage();
  const printBallotMutation = printBallot.useMutation();
  const [isEndingSession, setIsEndingSession] = useState(false);

  const printJobStatusQuery = getPrintJobStatus.useQuery(printJobId);

  function print() {
    // We track the printed ballot state to avoid re-printing in the case where
    // the voter flow is unmounted and re-mounted during ballot printing. This
    // is an edge case that would require an authenticated user (e.g. poll
    // worker) to log in and out during print. `print` is triggered by a
    // downstream useEffect, which is why it can be called multiple times.
    if (!hasPrintedBallot) {
      assert(ballotStyleId !== undefined);
      assert(precinctId !== undefined);
      setHasPrintedBallot();
      printBallotMutation.mutate(
        {
          languageCode,
          precinctId,
          ballotStyleId,
          votes,
        },
        { onSuccess: setPrintJobId }
      );
    }
  }

  const printOutcome =
    printJobId === undefined
      ? undefined
      : getPrintOutcome(printJobStatusQuery.data);
  const sentToPrinter = printOutcome === 'sent-to-printer';
  const failed = printOutcome === 'failed';

  React.useEffect(() => {
    if (sentToPrinter) {
      resetBallot(true);
    }
  }, [sentToPrinter, resetBallot]);

  // End the voter session to be sure we do not allow a duplicate ballot print.
  async function endSessionAfterFailure() {
    setIsEndingSession(true);
    await endVoterSession();
    resetBallot();
  }

  return (
    <React.Fragment>
      <MarkFlowPrintPage print={print} />
      {failed && (
        <Modal
          title={appStrings.titleBmdBallotNotPrinted()}
          content={
            <P>
              The ballot was not sent to the printer.{' '}
              {appStrings.instructionsAskForHelp()}
            </P>
          }
          actions={
            <Button disabled={isEndingSession} onPress={endSessionAfterFailure}>
              Close
            </Button>
          }
        />
      )}
    </React.Fragment>
  );
}
