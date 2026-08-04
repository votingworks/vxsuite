import { useContext, useEffect, useRef } from 'react';
import { PrintPage as MarkFlowPrintPage } from '@votingworks/mark-flow-ui';
import { assert } from '@votingworks/basics';
import { useCurrentLanguage } from '@votingworks/ui';
import { BallotContext } from '../contexts/ballot_context.js';
import { BALLOT_PRINTING_TIMEOUT_SECONDS } from '../config/globals.js';
import { printBallot } from '../api.js';

export function PrintPage(): JSX.Element {
  const {
    ballotStyleId,
    precinctId,
    votes,
    resetBallot,
    hasPrintedBallot,
    setHasPrintedBallot,
  } = useContext(BallotContext);
  const languageCode = useCurrentLanguage();
  const printBallotMutation = printBallot.useMutation();

  const printerTimer = useRef(0);

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
      printBallotMutation.mutate({
        languageCode,
        precinctId,
        ballotStyleId,
        votes,
      });
    }

    printerTimer.current = window.setTimeout(() => {
      resetBallot(true);
    }, BALLOT_PRINTING_TIMEOUT_SECONDS * 1000);
  }

  // Make sure we clean up any pending timeout on unmount
  useEffect(
    () => () => {
      clearTimeout(printerTimer.current);
    },
    []
  );

  return <MarkFlowPrintPage print={print} />;
}
