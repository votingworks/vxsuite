import {
  CentralScanReadinessReportContents,
  SaveReadinessReportButton,
  UsbImage,
} from '@votingworks/ui';
import styled from 'styled-components';
import { NavigationScreen } from '../navigation_screen';
import {
  getApplicationDiskSpaceSummary,
  getElectionDefinition,
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

export function DiagnosticsScreen(): JSX.Element {
  const statusQuery = getStatus.useQuery();
  const electionDefinitionQuery = getElectionDefinition.useQuery();
  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();
  const diskSpaceQuery = getApplicationDiskSpaceSummary.useQuery();
  const scannerDiagnosticRecordQuery =
    getMostRecentScannerDiagnostic.useQuery();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const saveReadinessReportMutation = saveReadinessReport.useMutation();

  if (
    !statusQuery.isSuccess ||
    !electionDefinitionQuery.isSuccess ||
    !batteryInfoQuery.isSuccess ||
    !diskSpaceQuery.isSuccess ||
    !scannerDiagnosticRecordQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess
  ) {
    return <NavigationScreen title="Diagnostics">{null}</NavigationScreen>;
  }

  const { isScannerAttached } = statusQuery.data;
  const electionDefinition = electionDefinitionQuery.data ?? undefined;
  const batteryInfo = batteryInfoQuery.data;
  const diskSpaceSummary = diskSpaceQuery.data;
  const scannerDiagnosticRecord =
    scannerDiagnosticRecordQuery.data ?? undefined;

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
