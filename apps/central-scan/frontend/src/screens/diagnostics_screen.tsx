import {
  CentralScanReadinessReportContents,
  SaveReadinessReportButton,
  UsbImage,
} from '@votingworks/ui';
import styled from 'styled-components';
import { NavigationScreen } from '../navigation_screen';
import {
  getApplicationDiskSpaceSummary,
  getElectionRecord,
  getMostRecentScannerDiagnostic,
  getStatus,
  getSystemSettings,
  getUsbDriveStatus,
  saveReadinessReport,
  systemCallApi,
} from '../api';
import { TestScanButton } from '../components/test_scan_button';

const PageLayout = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
`;

export function DiagnosticsScreen(): JSX.Element {
  const statusQuery = getStatus.useQuery();
  const electionRecordQuery = getElectionRecord.useQuery();
  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();
  const diskSpaceQuery = getApplicationDiskSpaceSummary.useQuery();
  const scannerDiagnosticRecordQuery =
    getMostRecentScannerDiagnostic.useQuery();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const saveReadinessReportMutation = saveReadinessReport.useMutation();
  const systemSettings = getSystemSettings.useQuery();

  if (
    !statusQuery.isSuccess ||
    !electionRecordQuery.isSuccess ||
    !batteryInfoQuery.isSuccess ||
    !diskSpaceQuery.isSuccess ||
    !scannerDiagnosticRecordQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess ||
    !systemSettings.isSuccess
  ) {
    return <NavigationScreen title="Diagnostics">{null}</NavigationScreen>;
  }

  const { isScannerAttached } = statusQuery.data;
  const { electionDefinition, electionPackageHash } =
    electionRecordQuery.data ?? {};
  const batteryInfo = batteryInfoQuery.data;
  const diskSpaceSummary = diskSpaceQuery.data;
  const scannerDiagnosticRecord =
    scannerDiagnosticRecordQuery.data ?? undefined;
  const { markThresholds } = systemSettings.data ?? {};

  return (
    <NavigationScreen title="Diagnostics">
      <PageLayout>
        <div>
          <CentralScanReadinessReportContents
            batteryInfo={batteryInfo ?? undefined}
            diskSpaceSummary={diskSpaceSummary}
            isScannerAttached={isScannerAttached}
            mostRecentScannerDiagnostic={scannerDiagnosticRecord}
            electionDefinition={electionDefinition}
            electionPackageHash={electionPackageHash}
            markThresholds={markThresholds}
          />
          <TestScanButton />
        </div>
        <SaveReadinessReportButton
          usbDriveStatus={usbDriveStatusQuery.data}
          saveReadinessReportMutation={saveReadinessReportMutation}
          usbImage={<UsbImage />}
        />
      </PageLayout>
    </NavigationScreen>
  );
}
