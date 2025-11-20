import React from 'react';
import {
  H1,
  P,
  Button,
  Icons,
  ReadOnLoad,
  appStrings,
  Font,
} from '@votingworks/ui';
import { VoterScreen } from '@votingworks/mark-flow-ui';
import styled from 'styled-components';
import { DiagnosticScreenHeader } from '../diagnostics/diagnostic_screen_components';

interface Props {
  isDiagnostic?: boolean;
  onPressBack: () => void;
  onPressContinue: () => void;
}

export const ExitStepInnerContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  flex: 1;
  padding: 0 40px;
  width: 100%;

  svg {
    height: 10em;
    display: block;
    margin: 0 auto;
  }
`;

export function ConfirmExitPatDeviceIdentificationPage({
  isDiagnostic,
  onPressBack,
  onPressContinue,
}: Props): JSX.Element {
  return (
    <VoterScreen
      centerContent
      hideMenuButtons={isDiagnostic}
      actionButtons={
        isDiagnostic ? (
          <Button variant="primary" onPress={onPressContinue}>
            Exit
          </Button>
        ) : (
          <React.Fragment>
            <Button icon="Previous" onPress={onPressBack}>
              {appStrings.buttonBack()}
            </Button>
            <Button
              variant="primary"
              rightIcon="Next"
              onPress={onPressContinue}
            >
              {appStrings.buttonContinue()}
            </Button>
          </React.Fragment>
        )
      }
    >
      <DiagnosticScreenHeader>
        <P>
          <Font weight="bold">
            {isDiagnostic
              ? 'Personal Assistive Technology Input Test'
              : appStrings.titleBmdPatCalibrationIdentificationPage()}
          </Font>
        </P>
      </DiagnosticScreenHeader>
      <ExitStepInnerContainer>
        <ReadOnLoad>
          <Icons.Done color="success" />
          <H1 align={isDiagnostic ? 'center' : undefined}>
            {isDiagnostic
              ? 'Test Passed'
              : appStrings.titleBmdPatCalibrationConfirmExitScreen()}
          </H1>
          <P>
            {!isDiagnostic &&
              appStrings.instructionsBmdPatCalibrationConfirmExitScreen()}
          </P>
        </ReadOnLoad>
      </ExitStepInnerContainer>
    </VoterScreen>
  );
}
