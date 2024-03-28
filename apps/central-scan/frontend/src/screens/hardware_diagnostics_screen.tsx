import {
  CentralScanReadinessReportContents,
  SaveReadinessReportButton,
  UsbImage,
} from '@votingworks/ui';
import styled from 'styled-components';
import { NavigationScreen } from '../navigation_screen';
import {
  getApplicationDiskSpaceSummary,
  getMostRecentScannerDiagnostic,
  getStatus,
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

export function HardwareDiagnosticsScreen(): JSX.Element {
  const statusQuery = getStatus.useQuery();
  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();
  const diskSpaceQuery = getApplicationDiskSpaceSummary.useQuery();
  const scannerDiagnosticRecordQuery =
    getMostRecentScannerDiagnostic.useQuery();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const saveReadinessReportMutation = saveReadinessReport.useMutation();

  if (
    !batteryInfoQuery.isSuccess ||
    !diskSpaceQuery.isSuccess ||
    !scannerDiagnosticRecordQuery.isSuccess ||
    !statusQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess
  ) {
    return (
      <NavigationScreen title="Hardware Diagnostics">{null}</NavigationScreen>
    );
  }

  const batteryInfo = batteryInfoQuery.data;
  const diskSpaceSummary = diskSpaceQuery.data;
  const scannerDiagnosticRecord =
    scannerDiagnosticRecordQuery.data ?? undefined;
  const { isScannerAttached } = statusQuery.data;

  return (
    <NavigationScreen title="Hardware Diagnostics">
      <PageLayout>
        <div>
          <CentralScanReadinessReportContents
            batteryInfo={batteryInfo ?? undefined}
            diskSpaceSummary={diskSpaceSummary}
            isScannerAttached={isScannerAttached}
            mostRecentScannerDiagnostic={scannerDiagnosticRecord}
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
