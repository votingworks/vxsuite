import { Button, H2, Loading, Main, P, Screen } from '@votingworks/ui';
import { DiagnosticRecord } from '@votingworks/types';
import React from 'react';
import {
  CancelButtonContainer,
  StepContainer,
} from './diagnostic_screen_components';
import { getStateMachineState } from '../../api';

export interface PaperHandlerDiagnosticProps {
  onClose: () => void;
  mostRecentPaperHandlerDiagnostic?: DiagnosticRecord;
}

export function PaperHandlerDiagnosticScreen({
  onClose,
  mostRecentPaperHandlerDiagnostic,
}: PaperHandlerDiagnosticProps): JSX.Element {
  const getStateMachineStateQuery = getStateMachineState.useQuery();

  let contents = <Loading />;
  let closeButton = (
    <Button icon="Delete" onPress={onClose}>
      Cancel Test
    </Button>
  );

  if (getStateMachineStateQuery.isSuccess) {
    const stateMachineState = getStateMachineStateQuery.data;
    switch (stateMachineState) {
      case 'paper_handler_diagnostic.prompt_for_paper':
      case 'paper_handler_diagnostic.load_paper':
        // Reuse appStrings value because we can, but other strings
        // don't need to be appStrings because this page isn't voter-facing
        contents = <P>Insert a sheet of ballot paper.</P>;
        break;
      case 'paper_handler_diagnostic.print_ballot_fixture':
      case 'paper_handler_diagnostic.scan_ballot':
      case 'paper_handler_diagnostic.interpret_ballot':
        contents = <P>A test ballot is being printed and scanned.</P>;
        break;
      case 'paper_handler_diagnostic.eject_to_rear':
        contents = <P>The test ballot is being ejected to the ballot box.</P>;
        break;
      case 'paper_handler_diagnostic.success':
        contents = <P>The diagnostic succeeded.</P>;
        closeButton = <Button onPress={onClose}>Exit</Button>;
        break;
      case 'paper_handler_diagnostic.failure':
        if (mostRecentPaperHandlerDiagnostic?.message) {
          contents = (
            <React.Fragment>
              <P>The diagnostic failed.</P>
              <P>{mostRecentPaperHandlerDiagnostic.message}.</P>
              <P>Exit the page and try again.</P>
            </React.Fragment>
          );
        } else {
          contents = <P>The diagnostic failed. Exit the page and try again.</P>;
        }

        closeButton = <Button onPress={onClose}>Exit</Button>;
        break;
      default:
      // Default contents are handled when the variable is defined
    }
  }

  return (
    <Screen>
      <Main flexColumn padded justifyContent="space-between">
        <H2>Printer-Scanner Test</H2>
        <StepContainer>{contents}</StepContainer>
        <CancelButtonContainer>{closeButton}</CancelButtonContainer>
      </Main>
    </Screen>
  );
}
