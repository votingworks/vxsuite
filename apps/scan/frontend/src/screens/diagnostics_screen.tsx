import {
  Button,
  Loading,
  P,
  SaveReadinessReportButton,
  ScanReadinessReportContents,
  UpsDiagnosticModalButton,
} from '@votingworks/ui';
import { Screen } from '../components/layout';
import {
  getConfig,
  getDiskSpaceSummary,
  getMostRecentPrinterDiagnostic,
  getMostRecentAudioDiagnostic,
  getPrinterStatus,
  getUsbDriveStatus,
  saveReadinessReport,
  getScannerStatus,
  beginScannerDiagnostic,
  getMostRecentScannerDiagnostic,
  endScannerDiagnostic,
  getMostRecentUpsDiagnostic,
  logUpsDiagnosticOutcome,
} from '../api';
import { PrintTestPageButton } from '../components/printer_management/print_test_page_button';
import { ElectionManagerLoadPaperButton } from '../components/printer_management/election_manager_load_paper_button';
import { AudioDiagnosticModalButton } from '../components/audio_diagnostic_modal_button';
import { POLLING_INTERVAL_FOR_SCANNER_STATUS_MS } from '../config/globals';
import { ScannerDiagnosticScreen } from './scanner_diagnostic_screen';

export function DiagnosticsScreen({
  onClose,
}: {
  onClose: VoidFunction;
}): JSX.Element {
  const saveReadinessReportMutation = saveReadinessReport.useMutation();
  const configQuery = getConfig.useQuery();
  const diskSpaceQuery = getDiskSpaceSummary.useQuery();
  const printerStatusQuery = getPrinterStatus.useQuery();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const mostRecentPrinterDiagnosticQuery =
    getMostRecentPrinterDiagnostic.useQuery();
  const mostRecentAudioDiagnosticQuery =
    getMostRecentAudioDiagnostic.useQuery();

  const mostRecentUpsDiagnosticQuery = getMostRecentUpsDiagnostic.useQuery();
  const logUpsDiagnosticOutcomeMutation = logUpsDiagnosticOutcome.useMutation();

  const scannerStatusQuery = getScannerStatus.useQuery({
    refetchInterval: POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
  });
  const beginScannerDiagnosticMutation = beginScannerDiagnostic.useMutation();
  const endScannerDiagnosticMutation = endScannerDiagnostic.useMutation();
  const mostRecentScannerDiagnosticQuery =
    getMostRecentScannerDiagnostic.useQuery();

  if (
    !configQuery.isSuccess ||
    !diskSpaceQuery.isSuccess ||
    !scannerStatusQuery.isSuccess ||
    !printerStatusQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess ||
    !mostRecentPrinterDiagnosticQuery.isSuccess ||
    !mostRecentScannerDiagnosticQuery.isSuccess ||
    !mostRecentUpsDiagnosticQuery.isSuccess
  ) {
    return (
      <Screen
        title="Diagnostics"
        voterFacing={false}
        showModeBanner={false}
        padded
      >
        <Loading />
      </Screen>
    );
  }

  const printerStatus = printerStatusQuery.data;
  const scannerStatus = scannerStatusQuery.data;
  const usbDriveStatus = usbDriveStatusQuery.data;
  const {
    electionDefinition,
    precinctSelection,
    electionPackageHash,
    systemSettings,
  } = configQuery.data;

  if (
    scannerStatus.state === 'scanner_diagnostic.running' ||
    scannerStatus.state === 'scanner_diagnostic.done'
  ) {
    return (
      <ScannerDiagnosticScreen
        scannerStatus={scannerStatus}
        onClose={() => endScannerDiagnosticMutation.mutate()}
      />
    );
  }

  return (
    <Screen
      title="Diagnostics"
      voterFacing={false}
      showModeBanner={false}
      padded
      hideBallotCount
      hideInfoBar
    >
      <P>
        <Button icon="Previous" variant="primary" onPress={onClose}>
          Back
        </Button>{' '}
        <SaveReadinessReportButton
          saveReadinessReportMutation={saveReadinessReportMutation}
          usbDriveStatus={usbDriveStatus}
        />
      </P>
      <ScanReadinessReportContents
        electionDefinition={electionDefinition}
        electionPackageHash={electionPackageHash}
        expectPrecinctSelection
        precinctSelection={precinctSelection}
        diskSpaceSummary={diskSpaceQuery.data}
        scannerStatus={scannerStatus}
        scannerActionChildren={
          <P>
            <Button
              disabled={
                beginScannerDiagnosticMutation.isLoading ||
                scannerStatus.state !== 'paused'
              }
              onPress={() => beginScannerDiagnosticMutation.mutate()}
            >
              Perform Test Scan
            </Button>
          </P>
        }
        mostRecentScannerDiagnostic={
          mostRecentScannerDiagnosticQuery.data ?? undefined
        }
        printerActionChildren={
          <P>
            <ElectionManagerLoadPaperButton isPrimary={false} />{' '}
            <PrintTestPageButton />
          </P>
        }
        printerStatus={printerStatus}
        mostRecentPrinterDiagnostic={
          mostRecentPrinterDiagnosticQuery.data ?? undefined
        }
        audioSectionAdditionalContents={<AudioDiagnosticModalButton />}
        mostRecentAudioDiagnostic={
          mostRecentAudioDiagnosticQuery.data ?? undefined
        }
        mostRecentUpsDiagnostic={mostRecentUpsDiagnosticQuery.data ?? undefined}
        upsSectionAdditionalContents={
          <UpsDiagnosticModalButton
            isLoading={logUpsDiagnosticOutcomeMutation.isLoading}
            logOutcome={logUpsDiagnosticOutcomeMutation.mutate}
          />
        }
        markThresholds={systemSettings.markThresholds}
      />
    </Screen>
  );
}
