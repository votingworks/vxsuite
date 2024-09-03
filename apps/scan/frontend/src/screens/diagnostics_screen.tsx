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
} from '../api';
import { PrintTestPageButton } from '../components/printer_management/print_test_page_button';
import { ElectionManagerLoadPaperButton } from '../components/printer_management/election_manager_load_paper_button';
import { AudioDiagnosticModalButton } from '../components/audio_diagnostic_modal_button';

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

  if (
    !configQuery.isSuccess ||
    !diskSpaceQuery.isSuccess ||
    !printerStatusQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess ||
    !mostRecentPrinterDiagnosticQuery.isSuccess
  ) {
    return (
      <Screen title="System Diagnostics" voterFacing={false} padded>
        <Loading />
      </Screen>
    );
  }

  const printerStatus = printerStatusQuery.data;
  assert(printerStatus.scheme === 'hardware-v4');

  const usbDriveStatus = usbDriveStatusQuery.data;

  const { electionDefinition, precinctSelection, electionPackageHash } =
    configQuery.data;
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
