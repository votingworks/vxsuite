import { appStrings, Caption, Icons, P } from '@votingworks/ui';

import { CenteredCardPageLayout } from '../components/centered_card_page_layout';
import { useIsVoterAuth } from '../hooks/use_is_voter_auth';
import { ResetVoterSessionButton } from '../components/deactivate_voter_session_button';

export function WaitingForBallotReinsertionBallotScreen(): JSX.Element {
  const isVoterAuth = useIsVoterAuth();

  return (
    <CenteredCardPageLayout
      icon={<Icons.Warning color="warning" />}
      title={appStrings.titleBmdBallotRemovedScreen()}
      voterFacing={isVoterAuth}
      buttons={isVoterAuth ? undefined : <ResetVoterSessionButton />}
    >
      <P>{appStrings.warningBmdBallotRemoved()}</P>
      <P>{appStrings.instructionsBmdReinsertBallot()}</P>
      <Caption>
        <Icons.Question /> {appStrings.noteAskPollWorkerForHelp()}
      </Caption>
    </CenteredCardPageLayout>
  );
}
