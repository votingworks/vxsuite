import React, { useContext } from 'react';
import { assert } from '@votingworks/basics';
import {
  Icons,
  P,
  appStrings,
  useCurrentLanguage,
  useLock,
} from '@votingworks/ui';
import { CenteredCardPageLayout } from '@votingworks/mark-flow-ui';
import { BallotContext } from '../contexts/ballot_context.js';
import { printBallot } from '../api.js';

export function PrintPage(): JSX.Element | null {
  const { ballotStyleId, precinctId, votes } = useContext(BallotContext);
  const languageCode = useCurrentLanguage();
  const printBallotMutate = printBallot.useMutation().mutate;
  const printLock = useLock();

  React.useEffect(() => {
    if (!printLock.lock()) return;
    assert(ballotStyleId !== undefined);
    assert(precinctId !== undefined);

    printBallotMutate({
      languageCode,
      precinctId,
      ballotStyleId,
      votes,
    });

    // No re-triggering deps - we only want to run this once on first render:
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CenteredCardPageLayout
      icon={<Icons.Info />}
      title={appStrings.titleBmdPrintScreen()}
      voterFacing
    >
      <P>{appStrings.instructionsBmdPrintScreenNoBallotRemoval()}</P>
      <P>{appStrings.noteBmdPrintedBallotReviewNextSteps()}</P>
    </CenteredCardPageLayout>
  );
}
