import {
  P,
  Font,
  Button,
  ReadOnLoad as BaseReadOnLoad,
  appStrings,
  Icons,
} from '@votingworks/ui';
import { useCallback, useState, useEffect } from 'react';
import { VoterScreen } from '@votingworks/mark-flow-ui';
import styled from 'styled-components';
import {
  DiagnosticScreenHeader,
  PatStepContainer,
} from '../diagnostics/diagnostic_screen_components';
import { PatIntroductionStep } from './pat_introduction_step';
import { IdentifyInputStep } from './identify_input_step';
import { handleKeyboardEvent } from '../../lib/assistive_technology';

export interface Props {
  isDiagnostic?: boolean;
  onAllInputsIdentified: () => void;
  onExitCalibration: () => void;
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
}: Props): JSX.Element {
  const [currentStepId, setCurrentStepId] = useState(StepId.ONE);

  useEffect(() => {
    // During PAT identification the voter triggers PAT inputs to identify them. We don't
    // want PAT input to actually navigate focus or select elements as random navigate +
    // select events could accidentally exit PAT calibration early.
    document.removeEventListener('keydown', handleKeyboardEvent);

    // On cleanup, re-enable the listener once devices are identified and the user is prompted
    // to select the "Continue with Voting" button
    return () => {
      document.addEventListener('keydown', handleKeyboardEvent);
    };
  }, []);

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
    <VoterScreen
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
    </VoterScreen>
  );
}
