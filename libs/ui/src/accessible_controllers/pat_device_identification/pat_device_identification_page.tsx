import React, { useCallback, useState } from 'react';
import styled from 'styled-components';

import { P, Font } from '../../typography';
import { Icons } from '../../icons';
import { Button } from '../../button';
import { ReadOnLoad as BaseReadOnLoad, appStrings } from '../../ui_strings';
import { PatIntroductionStep } from './pat_introduction_step';
import { IdentifyInputStep } from './identify_input_step';

export const DiagnosticScreenHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  width: 100%;
  padding: 40px;
`;

export const PatStepContainer = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 1080px;
  width: 100%;
`;

export interface PatDeviceIdentificationPageProps {
  isDiagnostic?: boolean;
  onAllInputsIdentified: () => void;
  onExitCalibration: () => void;
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

// Using explicit step IDs instead of a numeric index to ensure that the
// dependent `appStrings` are updated accordingly if steps are ever added or
// removed.
enum StepId {
  ONE = 'one',
  TWO = 'two',
  THREE = 'three',
}

const ReadOnLoad = styled(BaseReadOnLoad)`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
`;

export function PatDeviceIdentificationPage({
  isDiagnostic,
  onAllInputsIdentified,
  onExitCalibration,
  ScreenWrapper,
}: PatDeviceIdentificationPageProps): JSX.Element {
  const [currentStepId, setCurrentStepId] = useState(StepId.ONE);

  const goToStep2 = useCallback(() => setCurrentStepId(StepId.TWO), []);
  const goToStep3 = useCallback(() => setCurrentStepId(StepId.THREE), []);

  const steps: Record<StepId, JSX.Element> = {
    one: (
      <PatIntroductionStep
        isDiagnostic={isDiagnostic}
        onStepCompleted={goToStep2}
      />
    ),
    two: <IdentifyInputStep inputName="Move" onStepCompleted={goToStep3} />,
    three: (
      <IdentifyInputStep
        inputName="Select"
        onStepCompleted={onAllInputsIdentified}
      />
    ),
  };

  const statusStrings: Record<StepId, JSX.Element> = {
    one: appStrings.noteBmdPatCalibrationStep1(),
    two: appStrings.noteBmdPatCalibrationStep2(),
    three: appStrings.noteBmdPatCalibrationStep3(),
  };

  return (
    <ScreenWrapper
      centerContent
      hideMenuButtons={isDiagnostic}
      actionButtons={
        <Button onPress={onExitCalibration}>
          {isDiagnostic ? (
            <span>
              <Icons.Delete /> Cancel Test
            </span>
          ) : (
            appStrings.buttonBmdSkipPatCalibration()
          )}
        </Button>
      }
    >
      <ReadOnLoad>
        <DiagnosticScreenHeader>
          <P>
            <Font weight="bold">
              {isDiagnostic
                ? 'Personal Assistive Technology Input Test'
                : appStrings.titleBmdPatCalibrationIdentificationPage()}
            </Font>
            <br />
            {statusStrings[currentStepId]}
          </P>
        </DiagnosticScreenHeader>
        <PatStepContainer>{steps[currentStepId]}</PatStepContainer>
      </ReadOnLoad>
    </ScreenWrapper>
  );
}
