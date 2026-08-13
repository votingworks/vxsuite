import { AdminClientReadinessReportContents, Loading } from '@votingworks/ui';
import { useContext } from 'react';
import { NavigationScreen } from '../../components/navigation_screen.js';
import { systemCallApi } from '../../shared_api.js';
import { AppContext } from '../../contexts/app_context.js';

export function ClientDiagnosticsScreen(): JSX.Element {
  const { electionDefinition, electionPackageHash } = useContext(AppContext);
  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();
  const diskSpaceQuery = systemCallApi.getDiskSpaceSummary.useQuery();

  if (!batteryInfoQuery.isSuccess || !diskSpaceQuery.isSuccess) {
    return (
      <NavigationScreen title="Diagnostics">
        <Loading isFullscreen />
      </NavigationScreen>
    );
  }

  const batteryInfo = batteryInfoQuery.data;
  const diskSpaceSummary = diskSpaceQuery.data;

  return (
    <NavigationScreen title="Diagnostics">
      <AdminClientReadinessReportContents
        batteryInfo={batteryInfo ?? undefined}
        diskSpaceSummary={diskSpaceSummary}
        electionDefinition={electionDefinition}
        electionPackageHash={electionPackageHash}
      />
    </NavigationScreen>
  );
}
