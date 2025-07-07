import { appStrings, Caption, Icons, P } from '@votingworks/ui';

import { CenteredCardPageLayout } from '@votingworks/mark-flow-ui';

export function ReinsertedWrongPrecinctBallotScreen(): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Warning color="warning" />}
      title={appStrings.titleBmdInvalidBallotWrongPrecinct()}
      voterFacing
    >
      <P>{appStrings.warningBmdInvalidBallotWrongPrecinct()}</P>
      <P>{appStrings.instructionsBmdInsertPreviouslyPrintedBallot()}</P>
      <Caption>
        <Icons.Question /> {appStrings.noteAskPollWorkerForHelp()}
      </Caption>
    </CenteredCardPageLayout>
  );
}
