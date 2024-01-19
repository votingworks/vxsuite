import {
  FullScreenIconWrapper,
  H1,
  Icons,
  P,
  appStrings,
} from '@votingworks/ui';
import styled from 'styled-components';
import { DisplaySettingsButton } from '@votingworks/mark-flow-ui';
import { CenteredPageLayout } from '../components/centered_page_layout';

const Container = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
`;

const TextContainer = styled.div`
  display: flex;
  flex-direction: column;
  text-align: left;
  margin-left: 1rem;
`;

export function BallotSuccessfullyCastPage(): JSX.Element {
  const settingsButton = <DisplaySettingsButton />;
  return (
    <CenteredPageLayout voterFacing buttons={settingsButton}>
      <Container>
        <FullScreenIconWrapper>
          <Icons.Done color="success" />
        </FullScreenIconWrapper>
        <TextContainer>
          <H1>{appStrings.titleBallotSuccessfullyCastPage()}</H1>
          <P>{appStrings.noteThankYouForVoting()}</P>
        </TextContainer>
      </Container>
    </CenteredPageLayout>
  );
}
