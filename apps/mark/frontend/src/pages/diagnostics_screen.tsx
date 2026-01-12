import { useHistory, Switch, Route } from 'react-router-dom';
import {
  Button,
  H1,
  Loading,
  Main,
  MarkReadinessReportContents,
  P,
  SaveReadinessReportButton,
  Screen,
  UpsDiagnosticModalButton,
} from '@votingworks/ui';
import {
  getAccessibleControllerConnected,
  getBarcodeConnected,
  getDiskSpaceSummary,
  getElectionRecord,
  getElectionState,
  getMachineConfig,
  getMostRecentDiagnostic,
  getPatInputConnected,
  getPrinterStatus,
  getUsbDriveStatus,
  saveReadinessReport,
  logUpsDiagnosticOutcome,
} from '../api';
import { HeadphoneInputDiagnosticScreen } from './headphone_input_diagnostic_screen';
import { BarcodeReaderDiagnosticScreen } from './barcode_reader_diagnostic_screen';
import { PatInputDiagnosticScreen } from './pat_input_diagnostic_screen';
import { PrintTestPageButton } from '../components/print_diagnostic_button';
import { SystemAudioDiagnosticScreen } from './system_audio_diagnostic_screen';

export interface DiagnosticsScreenProps {
  onBackButtonPress: () => void;
}

export function DiagnosticsScreen({
  onBackButtonPress,
}: DiagnosticsScreenProps): JSX.Element {
  const history = useHistory();

  // Configuration data
  const machineConfigQuery = getMachineConfig.useQuery();
  const electionRecordQuery = getElectionRecord.useQuery();
  const electionStateQuery = getElectionState.useQuery();
  const diskSpaceSummaryQuery = getDiskSpaceSummary.useQuery();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const printerStatusQuery = getPrinterStatus.useQuery();

  // Device connection status
  const accessibleControllerConnectedQuery =
    getAccessibleControllerConnected.useQuery();
  const patDeviceConnectedQuery = getPatInputConnected.useQuery();
  const barcodeReaderConnectedQuery = getBarcodeConnected.useQuery();

  // Most recent diagnostic records
  const accessibleControllerDiagnosticQuery = getMostRecentDiagnostic.useQuery(
    'mark-accessible-controller'
  );
  const patInputDiagnosticQuery =
    getMostRecentDiagnostic.useQuery('mark-pat-input');
  const headphoneInputDiagnosticQuery = getMostRecentDiagnostic.useQuery(
    'mark-headphone-input'
  );
  const systemAudioDiagnosticQuery =
    getMostRecentDiagnostic.useQuery('mark-system-audio');
  const barcodeReaderDiagnosticQuery = getMostRecentDiagnostic.useQuery(
    'mark-barcode-reader'
  );
  const upsDiagnosticQuery = getMostRecentDiagnostic.useQuery(
    'uninterruptible-power-supply'
  );
  const printerDiagnosticQuery = getMostRecentDiagnostic.useQuery('test-print');

  const logUpsDiagnosticOutcomeMutation = logUpsDiagnosticOutcome.useMutation();
  const saveReadinessReportMutation = saveReadinessReport.useMutation();

  if (
    !machineConfigQuery.isSuccess ||
    !electionRecordQuery.isSuccess ||
    !electionStateQuery.isSuccess ||
    !diskSpaceSummaryQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess ||
    !printerStatusQuery.isSuccess ||
    !accessibleControllerConnectedQuery.isSuccess ||
    !patDeviceConnectedQuery.isSuccess ||
    !barcodeReaderConnectedQuery.isSuccess ||
    !accessibleControllerDiagnosticQuery.isSuccess ||
    !patInputDiagnosticQuery.isSuccess ||
    !headphoneInputDiagnosticQuery.isSuccess ||
    !barcodeReaderDiagnosticQuery.isSuccess ||
    !upsDiagnosticQuery.isSuccess ||
    !printerDiagnosticQuery.isSuccess ||
    !systemAudioDiagnosticQuery.isSuccess
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
  const diskSpaceSummary = diskSpaceSummaryQuery.data;
  const usbDriveStatus = usbDriveStatusQuery.data;
  const printerStatus = printerStatusQuery.data;
  const accessibleControllerConnected = accessibleControllerConnectedQuery.data;
  const patDeviceConnected = patDeviceConnectedQuery.data;
  const barcodeReaderConnected = barcodeReaderConnectedQuery.data;

  const mostRecentAccessibleControllerDiagnostic =
    accessibleControllerDiagnosticQuery.data ?? undefined;
  const mostRecentPatInputDiagnostic =
    patInputDiagnosticQuery.data ?? undefined;
  const mostRecentHeadphoneInputDiagnostic =
    headphoneInputDiagnosticQuery.data ?? undefined;
  const mostRecentSystemAudioDiagnostic =
    systemAudioDiagnosticQuery.data ?? undefined;
  const mostRecentBarcodeReaderDiagnostic =
    barcodeReaderDiagnosticQuery.data ?? undefined;
  const mostRecentUpsDiagnostic = upsDiagnosticQuery.data ?? undefined;
  const mostRecentPrinterDiagnostic = printerDiagnosticQuery.data ?? undefined;

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
                usbDriveStatus={usbDriveStatus}
              />
            </P>
            <MarkReadinessReportContents
              electionDefinition={electionDefinition}
              electionPackageHash={electionPackageHash}
              precinctSelection={precinctSelection}
              diskSpaceSummary={diskSpaceSummary}
              printerStatus={printerStatus}
              mostRecentPrinterDiagnostic={mostRecentPrinterDiagnostic}
              printerDiagnosticUi={<PrintTestPageButton />}
              mostRecentUpsDiagnostic={mostRecentUpsDiagnostic}
              upsSectionAdditionalContents={
                <UpsDiagnosticModalButton
                  isLoading={logUpsDiagnosticOutcomeMutation.isLoading}
                  logOutcome={logUpsDiagnosticOutcomeMutation.mutate}
                />
              }
              accessibleControllerProps={{
                isDeviceConnected: accessibleControllerConnected,
                mostRecentDiagnosticRecord:
                  mostRecentAccessibleControllerDiagnostic,
              }}
              patInputProps={{
                isDeviceConnected: patDeviceConnected,
                mostRecentDiagnosticRecord: mostRecentPatInputDiagnostic,
                children: (
                  <Button onPress={() => history.push('/pat-input')}>
                    Test PAT Input
                  </Button>
                ),
              }}
              barcodeReaderProps={{
                isDeviceConnected: barcodeReaderConnected,
                mostRecentDiagnosticRecord: mostRecentBarcodeReaderDiagnostic,
                children: (
                  <Button onPress={() => history.push('/barcode-reader')}>
                    Test Barcode Reader
                  </Button>
                ),
              }}
              headphoneInputProps={{
                mostRecentDiagnosticRecord: mostRecentHeadphoneInputDiagnostic,
                children: (
                  <Button onPress={() => history.push('/headphone-input')}>
                    Test Headphone Input
                  </Button>
                ),
              }}
              systemAudioProps={{
                mostRecentDiagnosticRecord: mostRecentSystemAudioDiagnostic,
                children: (
                  <Button onPress={() => history.push('/system-audio')}>
                    Test System Audio
                  </Button>
                ),
              }}
            />
          </Main>
        </Screen>
      </Route>
      <Route path="/pat-input">
        <PatInputDiagnosticScreen
          onComplete={() => history.push('/')}
          onCancel={() => history.push('/')}
        />
      </Route>
      <Route path="/barcode-reader">
        <BarcodeReaderDiagnosticScreen
          onComplete={() => history.push('/')}
          onCancel={() => history.push('/')}
        />
      </Route>
      <Route path="/headphone-input">
        <HeadphoneInputDiagnosticScreen
          onComplete={() => history.push('/')}
          onCancel={() => history.push('/')}
        />
      </Route>
      <Route path="/system-audio">
        <SystemAudioDiagnosticScreen
          onComplete={() => history.push('/')}
          onCancel={() => history.push('/')}
        />
      </Route>
    </Switch>
  );
}
