import { CentralScanReadinessReportContents } from '@votingworks/ui';
import type { ScanStatus } from '@votingworks/central-scan-backend';
import { NavigationScreen } from '../navigation_screen';
import { getApplicationDiskSpaceSummary, systemCallApi } from '../api';

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
      <CentralScanReadinessReportContents
        batteryInfo={batteryInfo ?? undefined}
        diskSpaceSummary={diskSpaceSummary}
        isScannerAttached={scanStatus.isScannerAttached}
      />
    </NavigationScreen>
  );
}
