import {
  FullScreenIconWrapper,
  H1,
  Icons,
  P,
  appStrings,
} from '@votingworks/ui';
import { CenteredPageLayout } from '../components/centered_page_layout';

export function BallotSuccessfullyCastPage(): JSX.Element {
  return (
    <CenteredPageLayout voterFacing>
      <FullScreenIconWrapper>
        <Icons.Done color="success" />
      </FullScreenIconWrapper>
      <H1 align="left">{appStrings.titleBallotSuccessfullyCastPage()}</H1>
      <P align="left">{appStrings.noteThankYouForVoting()}</P>
    </CenteredPageLayout>
  );
}
