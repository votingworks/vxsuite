import { useCallback, useState } from 'react';
import styled from 'styled-components';
import { P } from '../../typography';
import { Font } from '../../typography';
import { appStrings } from '../../ui_strings';
import { PatIntroductionStep } from './pat_introduction_step';
import { IdentifyInputStep } from './identify_input_step';

export const DiagnosticScreenHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  min-height: 3.5rem;
  border-bottom: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.onBackground};

  & > p {
    margin-bottom: 0;
  }
`;

export const PatStepContainer = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  align-items: center;
  justify-content: space-around;
  padding: 3rem;
`;

export interface PatDeviceIdentificationPageProps {
  isDiagnostic?: boolean;
  onAllInputsIdentified: () => void;
}

// Using explicit step IDs instead of a numeric index to ensure that the
// dependent `appStrings` are updated accordingly if steps are ever added or
// removed.
enum StepId {
  ONE = 'one',
  TWO = 'two',
  THREE = 'three',
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
`;

/**
 * PAT device identification flow content. This component renders just the
 * calibration UI steps - the consuming app is responsible for wrapping this
 * in an appropriate screen layout with any needed buttons.
 */
export function PatDeviceIdentificationPage({
  isDiagnostic,
  onAllInputsIdentified,
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
    <Container>
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
    </Container>
  );
}
