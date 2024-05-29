import {
  Button,
  H1,
  Main,
  Screen,
  P,
  MarkScanReadinessReportContents,
  Loading,
  SaveReadinessReportButton,
} from '@votingworks/ui';
import { useHistory, Switch, Route } from 'react-router-dom';
import { AccessibleControllerDiagnosticScreen } from './accessible_controller_diagnostic_screen';
import {
  getApplicationDiskSpaceSummary,
  getElectionDefinition,
  getElectionState,
  getIsAccessibleControllerInputDetected,
  getMostRecentAccessibleControllerDiagnostic,
  getMostRecentPaperHandlerDiagnostic,
  getStateMachineState,
  getUsbDriveStatus,
  saveReadinessReport,
  startPaperHandlerDiagnostic,
  systemCallApi,
} from '../../api';
import { PaperHandlerDiagnosticScreen } from './paper_handler_diagnostic_screen';

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
  const mostRecentAccessibleControllerDiagnosticQuery =
    getMostRecentAccessibleControllerDiagnostic.useQuery();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const saveReadinessReportMutation = saveReadinessReport.useMutation();
  const getStateMachineStateQuery = getStateMachineState.useQuery();
  const mostRecentPaperHandlerDiagnosticQuery =
    getMostRecentPaperHandlerDiagnostic.useQuery();

  const startPaperHandlerDiagnosticMutation =
    startPaperHandlerDiagnostic.useMutation();

  const history = useHistory();

  if (
    !electionDefinitionQuery.isSuccess ||
    !electionStateQuery.isSuccess ||
    !batteryQuery.isSuccess ||
    !diskSpaceQuery.isSuccess ||
    !isAccessibleControllerInputDetectedQuery.isSuccess ||
    !mostRecentAccessibleControllerDiagnosticQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess ||
    !getStateMachineStateQuery.isSuccess ||
    !mostRecentPaperHandlerDiagnosticQuery.isSuccess
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
  const mostRecentAccessibleControllerDiagnostic =
    mostRecentAccessibleControllerDiagnosticQuery.data ?? undefined;
  const stateMachineState = getStateMachineStateQuery.data;
  const mostRecentPaperHandlerDiagnostic =
    mostRecentPaperHandlerDiagnosticQuery.data ?? undefined;

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
    </Switch>
  );
}
