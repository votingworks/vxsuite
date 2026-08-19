import {
  CentralScanReadinessReportContents,
  SaveReadinessReportButton,
  UpsDiagnosticModalButton,
} from '@votingworks/ui';
import styled from 'styled-components';
import { NavigationScreen } from '../navigation_screen.js';
import {
  getDiskSpaceSummary,
  getElectionRecord,
  getMostRecentScannerDiagnostic,
  getMostRecentUpsDiagnostic,
  getNetworkStatus,
  getStatus,
  getSystemSettings,
  getUsbDriveStatus,
  logMostRecentUpsDiagnosticOutcome,
  saveReadinessReport,
  systemCallApi,
} from '../api.js';
import { NetworkSection } from '../components/network_section.js';
import { TestScanButton } from '../components/test_scan_button.js';

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
  const diskSpaceQuery = getDiskSpaceSummary.useQuery();
  const scannerDiagnosticRecordQuery =
    getMostRecentScannerDiagnostic.useQuery();
  const upsDiagnosticRecordQuery = getMostRecentUpsDiagnostic.useQuery();
  const logUpsDiagnosticOutcomeMutation =
    logMostRecentUpsDiagnosticOutcome.useMutation();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const saveReadinessReportMutation = saveReadinessReport.useMutation();
  const systemSettings = getSystemSettings.useQuery();
  const networkStatusQuery = getNetworkStatus.useQuery();

  if (
    !statusQuery.isSuccess ||
    !electionRecordQuery.isSuccess ||
    !batteryInfoQuery.isSuccess ||
    !diskSpaceQuery.isSuccess ||
    !scannerDiagnosticRecordQuery.isSuccess ||
    !upsDiagnosticRecordQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess ||
    !systemSettings.isSuccess ||
    !networkStatusQuery.isSuccess
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
  const upsDiagnosticRecord = upsDiagnosticRecordQuery.data ?? undefined;
  /* istanbul ignore next */
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
            mostRecentUpsDiagnostic={upsDiagnosticRecord}
            upsSectionAdditionalContents={
              <UpsDiagnosticModalButton
                logOutcome={logUpsDiagnosticOutcomeMutation.mutate}
                isLoading={logUpsDiagnosticOutcomeMutation.isLoading}
              />
            }
            electionDefinition={electionDefinition}
            electionPackageHash={electionPackageHash}
            markThresholds={markThresholds}
          />
          <TestScanButton />
          {networkStatusQuery.data.isEnabled && (
            <NetworkSection connection={networkStatusQuery.data.connection} />
          )}
        </div>
        <SaveReadinessReportButton
          usbDriveStatus={usbDriveStatusQuery.data}
          saveReadinessReportMutation={saveReadinessReportMutation}
        />
      </PageLayout>
    </NavigationScreen>
  );
}
