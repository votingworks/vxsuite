import { appStrings, Caption, Icons, P } from '@votingworks/ui';

import { CenteredCardPageLayout } from '@votingworks/mark-flow-ui';

export function ReinsertedNonBallotScreen(): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Warning color="warning" />}
      title={appStrings.titleBmdInvalidBallotNoBallotDetected()}
      voterFacing
    >
      <P>
        {appStrings.warningBmdInvalidBallotNoBallotDetected()}{' '}
        {appStrings.instructionsBmdInsertPreviouslyPrintedBallot()}
      </P>
      <P>{appStrings.instructionsBmdInsertBallotFaceUp()}</P>
      <Caption>
        <Icons.Question /> {appStrings.noteAskPollWorkerForHelp()}
      </Caption>
    </CenteredCardPageLayout>
  );
}
