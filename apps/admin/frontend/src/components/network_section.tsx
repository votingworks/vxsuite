import { H2, Icons, P } from '@votingworks/ui';
import { getNetworkStatus } from '../api.js';
import { isMultiStationAdjudicationEnabled } from '../shared_api.js';

export function NetworkSection(): JSX.Element | null {
  const isMultiStationEnabled =
    isMultiStationAdjudicationEnabled.useQuery().data ??
    /* @coverage-defer */ false;
  const networkStatusQuery = getNetworkStatus.usePollingQuery({
    enabled: isMultiStationEnabled,
  });

  if (!isMultiStationEnabled || !networkStatusQuery.isSuccess) {
    return null;
  }

  const { isOnline, multipleHostsDetected } = networkStatusQuery.data;

  return (
    <section>
      <H2>Network</H2>
      {isOnline ? (
        <P>
          <Icons.Checkbox color="success" /> Online
        </P>
      ) : (
        <P>
          <Icons.Info /> Offline
        </P>
      )}
      {multipleHostsDetected && (
        <P>
          <Icons.Danger color="danger" /> Multiple VxAdmins detected on the
          network. Ensure only one VxAdmin is connected.
        </P>
      )}
    </section>
  );
}
