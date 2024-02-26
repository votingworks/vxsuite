import { CentralScanReadinessReportContents } from '@votingworks/ui';
import { NavigationScreen } from '../navigation_screen';
import { getApplicationDiskSpaceSummary, systemCallApi } from '../api';

export function HardwareDiagnosticsScreen(): JSX.Element {
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
      />
    </NavigationScreen>
  );
}
