import {
  Button,
  H1,
  Main,
  Screen,
  P,
  MarkScanReadinessReportContents,
  Loading,
  SaveReadinessReportButton,
  appStrings,
} from '@votingworks/ui';
import { useHistory, Switch, Route } from 'react-router-dom';
import { AccessibleControllerDiagnosticScreen } from './accessible_controller_diagnostic_screen';
import {
  getApplicationDiskSpaceSummary,
  getElectionDefinition,
  getElectionState,
  getIsAccessibleControllerInputDetected,
  getStateMachineState,
  getUsbDriveStatus,
  getIsPatDeviceConnected,
  saveReadinessReport,
  startPaperHandlerDiagnostic,
  systemCallApi,
  getMostRecentDiagnostic,
  addDiagnosticRecord,
} from '../../api';
import { PaperHandlerDiagnosticScreen } from './paper_handler_diagnostic_screen';
import { PatDeviceCalibrationPage } from '../pat_device_identification/pat_device_calibration_page';

export interface DiagnosticsScreenProps {
  onBackButtonPress: () => void;
}

export function DiagnosticsScreen({
  onBackButtonPress,
}: DiagnosticsScreenProps): JSX.Element {
  const electionDefinitionQuery = getElectionDefinition.useQuery();
  const electionStateQuery = getElectionState.useQuery();
  const batteryQuery = systemCallApi.getBatteryInfo.useQuery();
  const diskSpaceQuery = getApplicationDiskSpaceSummary.useQuery();
  const isAccessibleControllerInputDetectedQuery =
    getIsAccessibleControllerInputDetected.useQuery();
  const isPatDeviceConnectedQuery = getIsPatDeviceConnected.useQuery();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const getStateMachineStateQuery = getStateMachineState.useQuery();

  const mostRecentAccessibleControllerDiagnosticQuery =
    getMostRecentDiagnostic.useQuery('mark-scan-accessible-controller');
  const mostRecentPaperHandlerDiagnosticQuery =
    getMostRecentDiagnostic.useQuery('mark-scan-paper-handler');
  const mostRecentPatInputDiagnosticQuery = getMostRecentDiagnostic.useQuery(
    'mark-scan-pat-input'
  );

  const startPaperHandlerDiagnosticMutation =
    startPaperHandlerDiagnostic.useMutation();
  const addPatDiagnosticRecordMutation = addDiagnosticRecord.useMutation(
    'mark-scan-pat-input'
  );
  const saveReadinessReportMutation = saveReadinessReport.useMutation();

  const history = useHistory();

  if (
    !electionDefinitionQuery.isSuccess ||
    !electionStateQuery.isSuccess ||
    !batteryQuery.isSuccess ||
    !diskSpaceQuery.isSuccess ||
    !isAccessibleControllerInputDetectedQuery.isSuccess ||
    !isPatDeviceConnectedQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess ||
    !getStateMachineStateQuery.isSuccess ||
    !mostRecentAccessibleControllerDiagnosticQuery.isSuccess ||
    !mostRecentPaperHandlerDiagnosticQuery.isSuccess ||
    !mostRecentPatInputDiagnosticQuery.isSuccess
  ) {
    return (
      <Screen>
        <Main padded>
          <H1>System Diagnostics</H1>
          <Loading />
        </Main>
      </Screen>
    );
  }

  const electionDefinition = electionDefinitionQuery.data ?? undefined;
  const { precinctSelection } = electionStateQuery.data;
  const battery = batteryQuery.data ?? undefined;
  const diskSpaceSummary = diskSpaceQuery.data;
  const isAccessibleControllerInputDetected =
    isAccessibleControllerInputDetectedQuery.data;
  const isPatDeviceConnected = isPatDeviceConnectedQuery.data;
  const stateMachineState = getStateMachineStateQuery.data;

  const mostRecentAccessibleControllerDiagnostic =
    mostRecentAccessibleControllerDiagnosticQuery.data ?? undefined;
  const mostRecentPaperHandlerDiagnostic =
    mostRecentPaperHandlerDiagnosticQuery.data ?? undefined;
  const mostRecentPatInputDiagnostic =
    mostRecentPatInputDiagnosticQuery.data ?? undefined;

  return (
    <Switch>
      <Route path="/" exact>
        <Screen>
          <Main padded>
            <H1>System Diagnostics</H1>
            <P>
              <Button
                icon="Previous"
                variant="primary"
                onPress={onBackButtonPress}
              >
                Back
              </Button>{' '}
              <SaveReadinessReportButton
                saveReadinessReportMutation={saveReadinessReportMutation}
                usbDriveStatus={usbDriveStatusQuery.data}
              />
            </P>
            <MarkScanReadinessReportContents
              electionDefinition={electionDefinition}
              precinctSelection={precinctSelection}
              batteryInfo={battery}
              diskSpaceSummary={diskSpaceSummary}
              accessibleControllerProps={{
                isDeviceConnected: isAccessibleControllerInputDetected,
                mostRecentDiagnosticRecord:
                  mostRecentAccessibleControllerDiagnostic,
                children: (
                  <Button
                    onPress={() => history.push('/accessible-controller')}
                  >
                    Test Accessible Controller
                  </Button>
                ),
              }}
              paperHandlerProps={{
                isDeviceConnected: stateMachineState !== 'no_hardware',
                mostRecentDiagnosticRecord: mostRecentPaperHandlerDiagnostic,
                children: (
                  <Button
                    onPress={() => {
                      startPaperHandlerDiagnosticMutation.mutate();
                      history.push('/paper-handler');
                    }}
                  >
                    Test Printer/Scanner
                  </Button>
                ),
              }}
              patInputProps={{
                isDeviceConnected: isPatDeviceConnected,
                mostRecentDiagnosticRecord: mostRecentPatInputDiagnostic,
                children: (
                  <Button
                    onPress={() => {
                      history.push('/pat-input');
                    }}
                  >
                    Test PAT Input (Sip & Puff)
                  </Button>
                ),
              }}
            />
          </Main>
        </Screen>
      </Route>
      <Route path="/accessible-controller">
        <AccessibleControllerDiagnosticScreen
          onClose={() => history.push('/')}
        />
      </Route>
      <Route path="/paper-handler">
        <PaperHandlerDiagnosticScreen
          onClose={async () => {
            history.push('/');
            // The diagnostic record is written by the backend after successful rear ejection.
            // Invalidating the query at the time of the last mutation in this flow is still too early
            // so we have to manually refetch.
            await mostRecentPaperHandlerDiagnosticQuery.refetch();
          }}
        />
      </Route>
      <Route path="/pat-input">
        <PatDeviceCalibrationPage
          successScreenButtonLabel={appStrings.buttonDone()}
          successScreenDescription={appStrings.instructionsBmdPatDiagnosticConfirmExitScreen()}
          onSuccessfulCalibration={() => {
            addPatDiagnosticRecordMutation.mutate({
              type: 'mark-scan-pat-input',
              outcome: 'pass',
            });
            history.push('/');
          }}
          onSkipCalibration={() => {
            addPatDiagnosticRecordMutation.mutate({
              type: 'mark-scan-pat-input',
              outcome: 'fail',
              message: 'Test was ended early.',
            });
            history.push('/');
          }}
        />
      </Route>
    </Switch>
  );
}
