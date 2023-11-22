import { Main, Screen, H1, P, Button, Icons } from '@votingworks/ui';
import { ButtonFooter } from '@votingworks/mark-flow-ui';
import { PortraitStepInnerContainer } from './portrait_step_inner_container';

interface Props {
  onPressBack: () => void;
  onPressContinue: () => void;
}

export function ConfirmExitPatDeviceIdentificationPage({
  onPressBack,
  onPressContinue,
}: Props): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <PortraitStepInnerContainer>
          <Icons.Done />
          <H1>Device Inputs Identified</H1>
          <P>You may continue with voting or go back to the previous screen.</P>
        </PortraitStepInnerContainer>
      </Main>
      <ButtonFooter>
        <Button icon="Previous" onPress={onPressBack}>
          Back
        </Button>
        <Button variant="primary" rightIcon="Next" onPress={onPressContinue}>
          Continue with Voting
        </Button>
      </ButtonFooter>
    </Screen>
  );
}
