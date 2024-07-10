import { appStrings, Caption, Icons, P } from '@votingworks/ui';

import { CenteredCardPageLayout } from '../components/centered_card_page_layout';

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
