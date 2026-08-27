import { styled } from './styled.js';
import { Icons } from './icons.js';

/**
 * The network statuses a machine's toolbar indicator can display, grouped by
 * severity:
 * - `connected` — neutral; on the network and connected to a host (or, for
 *   the host itself, online).
 * - `no-host-connected` — warning; online but not connected to a compatible
 *   VxAdmin host (none detected, or one detected but not connectable, e.g.
 *   configured for a different election). Not applicable to the host itself.
 * - `no-network` — warning; no network connection.
 * - `error` — danger; a network conflict that blocks all connections (e.g.
 *   multiple hosts detected or an incompatible software version).
 */
export type NetworkIndicatorStatus =
  | 'connected'
  | 'no-host-connected'
  | 'no-network'
  | 'error';

/**
 * Network statuses applicable to the VxAdmin host machine itself, which is
 * never waiting on a VxAdmin connection.
 */
export type HostNetworkIndicatorStatus = Exclude<
  NetworkIndicatorStatus,
  'no-host-connected'
>;

const IndicatorRow = styled.div`
  display: flex;
  flex-direction: row;
  gap: 0.5rem;
  align-items: center;
  white-space: nowrap;
`;

export type NetworkStatusIndicatorProps =
  | { isHost: true; status: HostNetworkIndicatorStatus }
  | { isHost?: false; status: NetworkIndicatorStatus };

/**
 * A toolbar indicator showing a machine's network status. Rendered on inverse
 * (dark) toolbar backgrounds.
 */
export function NetworkStatusIndicator(
  props: NetworkStatusIndicatorProps
): JSX.Element {
  const { isHost, status } = props;

  const contents: Record<
    NetworkIndicatorStatus,
    { icon: JSX.Element; label: string }
  > = {
    connected: {
      icon: <Icons.Network color="inverse" />,
      label: isHost ? 'Network Online' : 'Connected',
    },
    'no-host-connected': {
      icon: <Icons.NetworkOff color="inverse" />,
      label: 'No VxAdmin Connected',
    },
    'no-network': {
      icon: <Icons.NetworkOff color="inverse" />,
      label: 'No Network',
    },
    error: {
      icon: <Icons.NetworkOff color="inverseDanger" />,
      label: 'Network Error',
    },
  };
  const { icon, label } = contents[status];

  return (
    <IndicatorRow data-testid="network-status">
      {icon}
      {label}
    </IndicatorRow>
  );
}
