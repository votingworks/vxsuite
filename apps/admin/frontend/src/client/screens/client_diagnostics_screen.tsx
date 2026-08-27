import { useContext } from 'react';
import {
  AdminClientReadinessReportContents,
  H2,
  Icons,
  Loading,
  P,
} from '@votingworks/ui';
import { NavigationScreen } from '../../components/navigation_screen.js';
import { systemCallApi } from '../../shared_api.js';
import { AppContext } from '../../contexts/app_context.js';
import { getNetworkConnectionStatus } from '../api.js';

function NetworkSection(): JSX.Element {
  const networkStatusQuery = getNetworkConnectionStatus.usePollingQuery();

  return (
    <section>
      <H2>Network</H2>
      <P>
        {networkStatusQuery.isSuccess &&
          networkStatusQuery.data.status === 'online-connected-to-host' && (
            <span>
              <Icons.Checkbox color="success" /> Online &mdash; VxAdmin (
              {networkStatusQuery.data.hostMachineId}) connected on the network
            </span>
          )}
        {networkStatusQuery.isSuccess &&
          networkStatusQuery.data.status === 'online-waiting-for-host' && (
            <span>
              <Icons.Info /> Online &mdash; no VxAdmin detected on the network
            </span>
          )}
        {networkStatusQuery.isSuccess &&
          networkStatusQuery.data.status ===
            'online-multiple-hosts-detected' && (
            <span>
              <Icons.Danger color="danger" /> Multiple VxAdmins detected on the
              network. Ensure only one VxAdmin is connected.
            </span>
          )}
        {networkStatusQuery.isSuccess &&
          networkStatusQuery.data.status ===
            'online-incompatible-host-version' && (
            <span>
              <Icons.Danger color="danger" /> A VxAdmin on the network is
              running a different software version
            </span>
          )}
        {networkStatusQuery.isSuccess &&
          networkStatusQuery.data.status === 'offline' && (
            <span>
              <Icons.Info /> Offline
            </span>
          )}
        {!networkStatusQuery.isSuccess && <span>Checking network status…</span>}
      </P>
    </section>
  );
}

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
        networkSectionUi={<NetworkSection />}
      />
    </NavigationScreen>
  );
}
