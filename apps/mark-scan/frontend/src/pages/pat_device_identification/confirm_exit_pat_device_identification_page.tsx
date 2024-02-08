import React from 'react';
import { H1, P, Button, Icons, ReadOnLoad, appStrings } from '@votingworks/ui';
import { VoterScreen } from '@votingworks/mark-flow-ui';
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
    <VoterScreen
      centerContent
      actionButtons={
        <React.Fragment>
          <Button icon="Previous" onPress={onPressBack}>
            {appStrings.buttonBack()}
          </Button>
          <Button variant="primary" rightIcon="Next" onPress={onPressContinue}>
            {appStrings.buttonContinueVoting()}
          </Button>
        </React.Fragment>
      }
    >
      <PortraitStepInnerContainer>
        <ReadOnLoad>
          <Icons.Done color="success" />
          <H1>{appStrings.titleBmdPatCalibrationConfirmExitScreen()}</H1>
          <P>{appStrings.instructionsBmdPatCalibrationConfirmExitScreen()}</P>
        </ReadOnLoad>
      </PortraitStepInnerContainer>
    </VoterScreen>
  );
}
