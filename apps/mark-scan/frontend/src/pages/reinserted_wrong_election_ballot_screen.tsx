import { appStrings, Caption, Icons, P } from '@votingworks/ui';

import { CenteredCardPageLayout } from '@votingworks/mark-flow-ui';

export function ReinsertedWrongElectionBallotScreen(): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Warning color="warning" />}
      title={appStrings.titleBmdInvalidBallotWrongElection()}
      voterFacing
    >
      <P>{appStrings.warningBmdInvalidBallotWrongElection()}</P>
      <P>{appStrings.instructionsBmdInsertPreviouslyPrintedBallot()}</P>
      <Caption>
        <Icons.Question /> {appStrings.noteAskPollWorkerForHelp()}
      </Caption>
    </CenteredCardPageLayout>
  );
}
