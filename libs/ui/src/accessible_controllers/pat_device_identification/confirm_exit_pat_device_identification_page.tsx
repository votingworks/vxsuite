import React from 'react';
import styled from 'styled-components';

import { H1, P, Font } from '../../typography';
import { Icons } from '../../icons';
import { Button } from '../../button';
import { ReadOnLoad, appStrings } from '../../ui_strings';
import { DiagnosticScreenHeader } from './pat_device_identification_page';

interface ConfirmExitPatDeviceIdentificationPageProps {
  isDiagnostic?: boolean;
  onPressBack: () => void;
  onPressContinue: () => void;
  /**
   * Wrapper component to render the screen layout. Should accept children,
   * centerContent, hideMenuButtons, and actionButtons props.
   * In VxMarkScan, this is typically VoterScreen from @votingworks/mark-flow-ui.
   */
  ScreenWrapper: React.ComponentType<{
    children: React.ReactNode;
    centerContent?: boolean;
    hideMenuButtons?: boolean;
    actionButtons?: React.ReactNode;
  }>;
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
  ScreenWrapper,
}: ConfirmExitPatDeviceIdentificationPageProps): JSX.Element {
  return (
    <ScreenWrapper
      centerContent
      hideMenuButtons={isDiagnostic}
      actionButtons={
        isDiagnostic ? (
          <Button variant="primary" onPress={onPressContinue}>
            Exit
          </Button>
        ) : (
          // Using array instead of React.Fragment for better compatibility
          // with VxScan's ButtonBar grid layout
          [
            <Button
              key="continue"
              variant="primary"
              rightIcon="Next"
              onPress={onPressContinue}
            >
              {appStrings.buttonContinue()}
            </Button>,
            <Button key="back" icon="Previous" onPress={onPressBack}>
              {appStrings.buttonBack()}
            </Button>,
          ]
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
    </ScreenWrapper>
  );
}
