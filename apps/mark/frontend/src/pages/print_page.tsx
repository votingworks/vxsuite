import React, { useContext, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PrintPage as MarkFlowPrintPage } from '@votingworks/mark-flow-ui';
import { assert, assertDefined } from '@votingworks/basics';
import { Button, Modal, P, useCurrentLanguage } from '@votingworks/ui';
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
  const queryClient = useQueryClient();
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

  // A job we can no longer get status for is treated as a failure rather than
  // left pending, so the voter is never left on an indefinite "printing" screen.
  const jobStatus = printJobStatusQuery.data?.ok();
  const settled =
    printJobId !== undefined && printJobStatusQuery.data !== undefined;
  const sentToPrinter = jobStatus?.outcome === 'sent-to-printer';
  const failed =
    settled && !sentToPrinter && jobStatus?.outcome !== 'in-progress';

  React.useEffect(() => {
    if (sentToPrinter) {
      resetBallot(true);
    }
  }, [sentToPrinter, resetBallot]);

  // End the voter session to be sure we do not allow a duplicate ballot print.
  async function endSessionAfterFailure() {
    setIsEndingSession(true);
    // CUPS reuses job numbers, so drop this job's terminal status rather than
    // let a later session read it back from the cache.
    queryClient.removeQueries(
      getPrintJobStatus.queryKey(assertDefined(printJobId))
    );
    await endVoterSession();
    resetBallot();
  }

  return (
    <React.Fragment>
      <MarkFlowPrintPage print={print} />
      {failed && (
        <Modal
          title="Ballot Not Printed"
          content={
            <P>
              The ballot was not sent to the printer. Ask for a poll worker for
              help.
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
