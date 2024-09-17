import {
  Button,
  Loading,
  P,
  SaveReadinessReportButton,
  ScanReadinessReportContents,
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';
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
    !mostRecentScannerDiagnosticQuery.isSuccess
  ) {
    return (
      <Screen title="System Diagnostics" voterFacing={false} padded>
        <Loading />
      </Screen>
    );
  }

  const printerStatus = printerStatusQuery.data;
  assert(printerStatus.scheme === 'hardware-v4');
  const scannerStatus = scannerStatusQuery.data;
  const usbDriveStatus = usbDriveStatusQuery.data;
  const { electionDefinition, precinctSelection, electionPackageHash } =
    configQuery.data;

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
      title="System Diagnostics"
      voterFacing={false}
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
        audioSectionContents={<AudioDiagnosticModalButton />}
        mostRecentAudioDiagnostic={
          mostRecentAudioDiagnosticQuery.data ?? undefined
        }
      />
    </Screen>
  );
}
