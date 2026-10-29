import React, { useContext, useState } from 'react';
import { PrintPage as MarkFlowPrintPage } from '@votingworks/mark-flow-ui';
import { assert } from '@votingworks/basics';
import {
  appStrings,
  Button,
  getPrintJobDisplayStatus,
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
    printJobId,
    setPrintJobId,
  } = useContext(BallotContext);
  const languageCode = useCurrentLanguage();
  const printBallotMutation = printBallot.useMutation();
  const [isEndingSession, setIsEndingSession] = useState(false);

  const printJobStatusQuery = getPrintJobStatus.useQuery(printJobId);

  function print() {
    assert(ballotStyleId !== undefined);
    assert(precinctId !== undefined);
    void printBallotMutation
      .mutateAsync({
        languageCode,
        precinctId,
        ballotStyleId,
        votes,
      })
      .then(setPrintJobId);
  }

  const printOutcome =
    printJobId === undefined
      ? undefined
      : getPrintJobDisplayStatus(printJobStatusQuery.data).outcome;
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
