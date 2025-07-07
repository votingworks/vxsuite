import { Icons, P, appStrings } from '@votingworks/ui';
import { CenteredCardPageLayout } from '@votingworks/mark-flow-ui';

export function BallotSuccessfullyCastPage(): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Done color="success" />}
      title={appStrings.titleBallotSuccessfullyCastPage()}
      voterFacing
    >
      <P align="left">{appStrings.noteThankYouForVoting()}</P>
    </CenteredCardPageLayout>
  );
}
