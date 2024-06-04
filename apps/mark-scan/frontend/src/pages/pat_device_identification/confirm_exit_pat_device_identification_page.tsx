import React from 'react';
import { H1, P, Button, Icons, ReadOnLoad, appStrings } from '@votingworks/ui';
import { VoterScreen } from '@votingworks/mark-flow-ui';
import { PortraitStepInnerContainer } from './portrait_step_inner_container';

interface Props {
  onPressBack: () => void;
  onPressContinue: () => void;
  nextButtonLabel?: JSX.Element;
  description?: JSX.Element;
}

export function ConfirmExitPatDeviceIdentificationPage({
  onPressBack,
  onPressContinue,
  nextButtonLabel,
  description,
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
            {nextButtonLabel ?? appStrings.buttonContinueVoting()}
          </Button>
        </React.Fragment>
      }
    >
      <PortraitStepInnerContainer>
        <ReadOnLoad>
          <Icons.Done color="success" />
          <H1>{appStrings.titleBmdPatCalibrationConfirmExitScreen()}</H1>
          <P>
            {description ??
              appStrings.instructionsBmdPatCalibrationConfirmExitScreen()}
          </P>
        </ReadOnLoad>
      </PortraitStepInnerContainer>
    </VoterScreen>
  );
}
