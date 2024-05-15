import { useContext } from 'react';
import { PrintPage as MarkFlowPrintPage } from '@votingworks/mark-flow-ui';
import { assert } from '@votingworks/basics';
import { useCurrentLanguage } from '@votingworks/ui';
import { BallotContext } from '../contexts/ballot_context';
import { printBallot } from '../api';

export function PrintPage(): JSX.Element | null {
  const { ballotStyleId, precinctId, votes } = useContext(BallotContext);
  const languageCode = useCurrentLanguage();
  const printBallotMutation = printBallot.useMutation();

  function print(): void {
    assert(ballotStyleId !== undefined);
    assert(precinctId !== undefined);
    printBallotMutation.mutate({
      languageCode,
      precinctId,
      ballotStyleId,
      votes,
    });
  }

  return <MarkFlowPrintPage print={print} />;
}
