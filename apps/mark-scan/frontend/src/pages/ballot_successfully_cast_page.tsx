import {
  FullScreenIconWrapper,
  H1,
  Icons,
  P,
  appStrings,
} from '@votingworks/ui';
import { DisplaySettingsButton } from '@votingworks/mark-flow-ui';
import { CenteredPageLayout } from '../components/centered_page_layout';

export function BallotSuccessfullyCastPage(): JSX.Element {
  const settingsButton = <DisplaySettingsButton />;
  return (
    <CenteredPageLayout voterFacing buttons={settingsButton}>
      <FullScreenIconWrapper>
        <Icons.Done color="success" />
      </FullScreenIconWrapper>
      <H1 align="left">{appStrings.titleBallotSuccessfullyCastPage()}</H1>
      <P align="left">{appStrings.noteThankYouForVoting()}</P>
    </CenteredPageLayout>
  );
}
