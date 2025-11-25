import { H1, P, Font } from '../../typography';
import { Icons } from '../../icons';
import { ReadOnLoad, appStrings } from '../../ui_strings';
import styled from 'styled-components';
import { DiagnosticScreenHeader } from './pat_device_identification_page';

export interface ConfirmExitPatDeviceIdentificationPageProps {
  isDiagnostic?: boolean;
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

/**
 * Confirmation screen shown after PAT device inputs have been identified.
 * This component renders just the success content - the consuming app is
 * responsible for wrapping this in an appropriate screen layout with any
 * needed buttons.
 */
export function ConfirmExitPatDeviceIdentificationPage({
  isDiagnostic,
}: ConfirmExitPatDeviceIdentificationPageProps): JSX.Element {
  return (
    <div>
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
    </div>
  );
}
