import { CentralScanReadinessReportContents } from '@votingworks/ui';
import type { ScanStatus } from '@votingworks/central-scan-backend';
import styled from 'styled-components';
import { NavigationScreen } from '../navigation_screen';
import { getApplicationDiskSpaceSummary, systemCallApi } from '../api';
import { SaveReadinessReportButton } from '../components/save_readiness_report_button';

const PageLayout = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
`;

export interface HardwareDiagnosticsScreenProps {
  scanStatus: ScanStatus;
}

export function HardwareDiagnosticsScreen({
  scanStatus,
}: HardwareDiagnosticsScreenProps): JSX.Element {
  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();
  const diskSpaceQuery = getApplicationDiskSpaceSummary.useQuery();

  if (!batteryInfoQuery.isSuccess || !diskSpaceQuery.isSuccess) {
    return (
      <NavigationScreen title="Hardware Diagnostics">{null}</NavigationScreen>
    );
  }

  const batteryInfo = batteryInfoQuery.data;
  const diskSpaceSummary = diskSpaceQuery.data;

  return (
    <NavigationScreen title="Hardware Diagnostics">
      <PageLayout>
        <CentralScanReadinessReportContents
          batteryInfo={batteryInfo ?? undefined}
          diskSpaceSummary={diskSpaceSummary}
          isScannerAttached={scanStatus.isScannerAttached}
        />
        <SaveReadinessReportButton />
      </PageLayout>
    </NavigationScreen>
  );
}
