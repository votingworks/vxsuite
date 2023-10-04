import { Main, Screen, H1, P, Button } from '@votingworks/ui';
import { ButtonFooter } from '../../components/button_footer';

interface Props {
  onPressBack: () => void;
  onPressContinue: () => void;
}

export function ConfirmExitPatDeviceIdentificationPage({
  onPressBack,
  onPressContinue,
}: Props): JSX.Element {
  return (
    <Screen white>
      <Main padded centerChild>
        <H1>Device Inputs Identified</H1>
        <P>You may continue with voting or go back to the previous screen.</P>
      </Main>
      <ButtonFooter>
        <Button variant="previous" onPress={onPressBack}>
          Back
        </Button>
        <Button variant="next" onPress={onPressContinue}>
          Continue with Voting
        </Button>
      </ButtonFooter>
    </Screen>
  );
}
