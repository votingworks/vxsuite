import {
  Button,
  H1,
  Main,
  Screen,
  P,
  MarkScanReadinessReportContents,
  Loading,
} from '@votingworks/ui';
import { useHistory, Switch, Route } from 'react-router-dom';
import { AccessibleControllerDiagnosticScreen } from './accessible_controller_diagnostic_screen';
import {
  getApplicationDiskSpaceSummary,
  getMostRecentAccessibleControllerDiagnostic,
  systemCallApi,
} from '../api';

export interface DiagnosticsScreenProps {
  onBackButtonPress: () => void;
}

export function DiagnosticsScreen({
  onBackButtonPress,
}: DiagnosticsScreenProps): JSX.Element {
  const batteryQuery = systemCallApi.getBatteryInfo.useQuery();
  const mostRecentAccessibleControllerDiagnosticQuery =
    getMostRecentAccessibleControllerDiagnostic.useQuery();
  const diskSpaceQuery = getApplicationDiskSpaceSummary.useQuery();

  const history = useHistory();

  if (
    !batteryQuery.isSuccess ||
    !mostRecentAccessibleControllerDiagnosticQuery.isSuccess ||
    !diskSpaceQuery.isSuccess
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

  const battery = batteryQuery.data ?? undefined;
  const mostRecentAccessibleControllerDiagnostic =
    mostRecentAccessibleControllerDiagnosticQuery.data ?? undefined;
  const diskSpaceSummary = diskSpaceQuery.data;

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
              </Button>
            </P>
            <MarkScanReadinessReportContents
              diskSpaceSummary={diskSpaceSummary}
              batteryInfo={battery}
              mostRecentAccessibleControllerDiagnostic={
                mostRecentAccessibleControllerDiagnostic
              }
              isAccessibleControllerInputDetected
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
