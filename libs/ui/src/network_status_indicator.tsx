import React, { useId } from 'react';
import styled from 'styled-components';
import { Icons } from './icons';

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
  gap: 0.4rem;
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
  width: 1em;
  vertical-align: -0.125em;
  color: ${(p) => p.theme.colors.onInverse};
`;

function NetworkOffIcon(): JSX.Element {
  const maskId = useId();
  return (
    <NetworkOffSvg
      data-testid="network-off-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 640 640"
      fill="currentColor"
      aria-hidden="true"
    >
      <mask
        id={maskId}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="640"
        height="640"
      >
        <rect width="640" height="640" fill="#fff" />
        <line
          x1="60"
          y1="85.2"
          x2="568"
          y2="629.9"
          stroke="#000"
          strokeWidth="150"
          strokeLinecap="round"
        />
      </mask>
      <path
        mask={`url(#${maskId})`}
        d="M256 128C256 110.3 270.3 96 288 96L352 96C369.7 96 384 110.3 384 128L384 192C384 209.7 369.7 224 352 224L344 224L344 288L464 288C503.8 288 536 320.2 536 360L536 416L544 416C561.7 416 576 430.3 576 448L576 512C576 529.7 561.7 544 544 544L480 544C462.3 544 448 529.7 448 512L448 448C448 430.3 462.3 416 480 416L488 416L488 360C488 346.7 477.3 336 464 336L344 336L344 416L352 416C369.7 416 384 430.3 384 448L384 512C384 529.7 369.7 544 352 544L288 544C270.3 544 256 529.7 256 512L256 448C256 430.3 270.3 416 288 416L296 416L296 336L176 336C162.7 336 152 346.7 152 360L152 416L160 416C177.7 416 192 430.3 192 448L192 512C192 529.7 177.7 544 160 544L96 544C78.3 544 64 529.7 64 512L64 448C64 430.3 78.3 416 96 416L104 416L104 360C104 320.2 136.2 288 176 288L296 288L296 224L288 224C270.3 224 256 209.7 256 192L256 128z"
      />
      <line
        x1="120"
        y1="149.5"
        x2="508"
        y2="565.6"
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
      icon: <Icons.Sitemap color="inverse" />,
      label: isHost ? 'Network Online' : 'Connected',
    },
    'no-host-connected': {
      icon: <NetworkOffIcon />,
      label: 'No VxAdmin Connected',
    },
    'no-network': {
      icon: <NetworkOffIcon />,
      label: 'No Network',
    },
    error: {
      icon: (
        <React.Fragment>
          <NetworkOffIcon />
          <Icons.Danger color="inverseDanger" />
        </React.Fragment>
      ),
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
