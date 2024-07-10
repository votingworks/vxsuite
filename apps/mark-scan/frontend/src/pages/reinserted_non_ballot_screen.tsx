import { appStrings, Caption, Icons, P } from '@votingworks/ui';

import { CenteredCardPageLayout } from '../components/centered_card_page_layout';

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
