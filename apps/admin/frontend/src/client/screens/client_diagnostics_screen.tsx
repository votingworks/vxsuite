import { AdminClientReadinessReportContents } from '@votingworks/ui';
import { useContext } from 'react';
import { ClientNavigationScreen } from '../components/client_navigation_screen';
import { systemCallApi } from '../api';
import { Loading } from '../../components/loading';
import { AppContext } from '../../contexts/app_context';

export function ClientDiagnosticsScreen(): JSX.Element {
  const { electionDefinition, electionPackageHash } = useContext(AppContext);
  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();
  const diskSpaceQuery = systemCallApi.getDiskSpaceSummary.useQuery();

  if (!batteryInfoQuery.isSuccess || !diskSpaceQuery.isSuccess) {
    return (
      <ClientNavigationScreen title="Diagnostics">
        <Loading isFullscreen />
      </ClientNavigationScreen>
    );
  }

  const batteryInfo = batteryInfoQuery.data;
  const diskSpaceSummary = diskSpaceQuery.data;

  return (
    <ClientNavigationScreen title="Diagnostics">
      <AdminClientReadinessReportContents
        batteryInfo={batteryInfo ?? undefined}
        diskSpaceSummary={diskSpaceSummary}
        electionDefinition={electionDefinition}
        electionPackageHash={electionPackageHash}
        omitConfigSectionBallotStyles
      />
    </ClientNavigationScreen>
  );
}
