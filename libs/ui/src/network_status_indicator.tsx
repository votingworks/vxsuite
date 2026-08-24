import { useId } from 'react';
import styled, { useTheme } from 'styled-components';
import { iconColor, IconProps, Icons } from './icons';

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

/**
 * A slashed variant of the network (sitemap) icon, used for warning and error
 * states. Not part of FontAwesome, so it's inlined here. Sized and aligned to
 * match the FontAwesome icons rendered by `Icons`.
 */
const NetworkOffSvg = styled.svg`
  height: 1em;
  width: 1.125em;
  vertical-align: -0.125em;
`;

function NetworkOffIcon({ color }: Pick<IconProps, 'color'>): JSX.Element {
  const maskId = useId();
  const theme = useTheme();
  return (
    <NetworkOffSvg
      data-testid="network-off-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 576 512"
      fill="none"
      aria-hidden="true"
      style={{ color: iconColor(theme, color) }}
    >
      <mask
        id={maskId}
        maskUnits="userSpaceOnUse"
        x="0"
        y="-64"
        width="576"
        height="640"
      >
        <rect y="-64" width="576" height="640" fill="white" />
        <path
          d="M53 4L523 508"
          stroke="black"
          strokeWidth="110"
          strokeLinecap="round"
        />
      </mask>
      <path
        mask={`url(#${maskId})`}
        fill="currentColor"
        d="M208 80c0-26.5 21.5-48 48-48l64 0c26.5 0 48 21.5 48 48l0 64c0 26.5-21.5 48-48 48l-8 0 0 40 152 0c30.9 0 56 25.1 56 56l0 32 8 0c26.5 0 48 21.5 48 48l0 64c0 26.5-21.5 48-48 48l-64 0c-26.5 0-48-21.5-48-48l0-64c0-26.5 21.5-48 48-48l8 0 0-32c0-4.4-3.6-8-8-8l-152 0 0 40 8 0c26.5 0 48 21.5 48 48l0 64c0 26.5-21.5 48-48 48l-64 0c-26.5 0-48-21.5-48-48l0-64c0-26.5 21.5-48 48-48l8 0 0-40-152 0c-4.4 0-8 3.6-8 8l0 32 8 0c26.5 0 48 21.5 48 48l0 64c0 26.5-21.5 48-48 48l-64 0c-26.5 0-48-21.5-48-48l0-64c0-26.5 21.5-48 48-48l8 0 0-32c0-30.9 25.1-56 56-56l152 0 0-40-8 0c-26.5 0-48-21.5-48-48l0-64z"
      />
      <path
        d="M94 48L482 464"
        stroke="currentColor"
        strokeWidth="54"
        strokeLinecap="round"
      />
    </NetworkOffSvg>
  );
}

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
      icon: <NetworkOffIcon color="inverse" />,

      label: 'No VxAdmin Connected',
    },
    'no-network': {
      icon: <NetworkOffIcon color="inverse" />,
      label: 'No Network',
    },
    error: {
      icon: <NetworkOffIcon color="inverseDanger" />,
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
