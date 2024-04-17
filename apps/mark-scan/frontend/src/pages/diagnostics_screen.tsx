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
  getUsbDriveStatus,
  saveReadinessReport,
  systemCallApi,
} from '../api';

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

  const history = useHistory();

  if (
    !electionDefinitionQuery.isSuccess ||
    !electionStateQuery.isSuccess ||
    !batteryQuery.isSuccess ||
    !diskSpaceQuery.isSuccess ||
    !isAccessibleControllerInputDetectedQuery.isSuccess ||
    !mostRecentAccessibleControllerDiagnosticQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess
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
              isAccessibleControllerInputDetected={
                isAccessibleControllerInputDetected
              }
              mostRecentAccessibleControllerDiagnostic={
                mostRecentAccessibleControllerDiagnostic
              }
              accessibleControllerSectionChildren={
                <Button onPress={() => history.push('/accessible-controller')}>
                  Test Accessible Controller
                </Button>
              }
            />
          </Main>
        </Screen>
      </Route>
      <Route path="/accessible-controller">
        <AccessibleControllerDiagnosticScreen
          onClose={() => history.push('/')}
        />
      </Route>
    </Switch>
  );
}
