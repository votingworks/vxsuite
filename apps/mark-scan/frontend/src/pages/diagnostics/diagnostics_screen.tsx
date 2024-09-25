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
import { useHistory, Switch, Route, Redirect } from 'react-router-dom';
import { AccessibleControllerDiagnosticScreen } from './accessible_controller_diagnostic_screen';
import {
  getApplicationDiskSpaceSummary,
  getElectionRecord,
  getElectionState,
  getIsAccessibleControllerInputDetected,
  getStateMachineState,
  getUsbDriveStatus,
  getIsPatDeviceConnected,
  saveReadinessReport,
  startPaperHandlerDiagnostic,
  getMostRecentDiagnostic,
  addDiagnosticRecord,
  getMarkScanBmdModel,
  stopPaperHandlerDiagnostic,
} from '../../api';
import { PaperHandlerDiagnosticScreen } from './paper_handler_diagnostic_screen';
import { HeadphoneInputDiagnosticScreen } from './headphone_input_diagnostic_screen';
import { PatDeviceCalibrationPage } from '../pat_device_identification/pat_device_calibration_page';

export interface DiagnosticsScreenProps {
  onBackButtonPress: () => void;
}

export function DiagnosticsScreen({
  onBackButtonPress,
}: DiagnosticsScreenProps): JSX.Element {
  const electionRecordQuery = getElectionRecord.useQuery();
  const electionStateQuery = getElectionState.useQuery();
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
  const mostRecentHeadphoneInputDiagnosticQuery =
    getMostRecentDiagnostic.useQuery('mark-scan-headphone-input');
  const markScanBmdModelQuery = getMarkScanBmdModel.useQuery();

  const startPaperHandlerDiagnosticMutation =
    startPaperHandlerDiagnostic.useMutation();
  const stopPaperHandlerDiagnosticMutation =
    stopPaperHandlerDiagnostic.useMutation();
  const addPatDiagnosticRecordMutation = addDiagnosticRecord.useMutation(
    'mark-scan-pat-input'
  );
  const saveReadinessReportMutation = saveReadinessReport.useMutation();

  const history = useHistory();

  if (
    !electionRecordQuery.isSuccess ||
    !electionStateQuery.isSuccess ||
    !diskSpaceQuery.isSuccess ||
    !isAccessibleControllerInputDetectedQuery.isSuccess ||
    !isPatDeviceConnectedQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess ||
    !getStateMachineStateQuery.isSuccess ||
    !mostRecentAccessibleControllerDiagnosticQuery.isSuccess ||
    !mostRecentPaperHandlerDiagnosticQuery.isSuccess ||
    !mostRecentPatInputDiagnosticQuery.isSuccess ||
    !mostRecentHeadphoneInputDiagnosticQuery.isSuccess ||
    !markScanBmdModelQuery.isSuccess
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

  const { electionDefinition, electionPackageHash } =
    electionRecordQuery.data ?? {};
  const { precinctSelection } = electionStateQuery.data;
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
  const mostRecentHeadphoneInputDiagnostic =
    mostRecentHeadphoneInputDiagnosticQuery.data ?? undefined;

  // On the BMD 150 a single daemon handles PAT and accessible controller.
  // On the BMD 155 they are separate, but the PAT daemon doesn't report its
  // status in the same way, so we haven't implemented a way to read BMD 155
  // PAT daemon status.
  // As a graceful fallback for the BMD 155, the readiness report reports
  // on PAT device connection (ie. is a sip & puff plugged in?) rather than
  // PAT input availability (ie. is the daemon running and able to query firmware?)
  const isPatAvailable =
    markScanBmdModelQuery.data === 'bmd-150'
      ? isAccessibleControllerInputDetected
      : isPatDeviceConnected;

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
              electionPackageHash={electionPackageHash}
              precinctSelection={precinctSelection}
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
                isDeviceConnected: isPatAvailable,
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
                connectedText: 'Available',
                notConnectedText: 'Not available',
              }}
              headphoneInputProps={{
                mostRecentDiagnosticRecord: mostRecentHeadphoneInputDiagnostic,
                children: (
                  <Button
                    onPress={() => {
                      history.push('/headphone-input');
                    }}
                  >
                    Test Front Headphone Input
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
          mostRecentPaperHandlerDiagnostic={mostRecentPaperHandlerDiagnostic}
          onClose={async () => {
            stopPaperHandlerDiagnosticMutation.mutate();
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
          successScreenDescription={
            <span>
              You may end the diagnostic test or go back to the previous screen.
            </span>
          }
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
      <Route path="/headphone-input">
        <HeadphoneInputDiagnosticScreen
          onClose={() => {
            history.push('/');
          }}
        />
      </Route>
      {/* Redirect to / if we navigated here from another flow
      that uses react-router with different paths */}
      <Redirect to="/" />
    </Switch>
  );
}
