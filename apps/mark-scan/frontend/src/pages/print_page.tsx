import { useContext } from 'react';
import { PrintPage as MarkFlowPrintPage } from '@votingworks/mark-flow-ui';
import { assert } from '@votingworks/basics';
import { useCurrentLanguage } from '@votingworks/ui';
import { BallotContext } from '../contexts/ballot_context';
import { printBallot } from '../api';

export function PrintPage(): JSX.Element | null {
  const { electionDefinition, ballotStyleId, precinctId, votes } =
    useContext(BallotContext);
  assert(electionDefinition, 'electionDefinition is not defined');
  const languageCode = useCurrentLanguage();
  const printBallotMutation = printBallot.useMutation();

  // eslint-disable-next-line @typescript-eslint/require-await
  async function print(): Promise<void> {
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
