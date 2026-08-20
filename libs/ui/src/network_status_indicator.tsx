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

const IndicatorButton = styled.button`
  display: flex;
  flex-direction: row;
  gap: 0.4rem;
  align-items: center;
  white-space: nowrap;
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
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
          x1="48"
          y1="87.8"
          x2="624"
          y2="562.6"
          stroke="#000"
          strokeWidth="152"
          strokeLinecap="round"
        />
      </mask>
      <path
        mask={`url(#${maskId})`}
        d="M280 152L360 152L360 200L280 200L280 152zM272 96C245.5 96 224 117.5 224 144L224 208C224 234.5 245.5 256 272 256L288 256L288 288L64 288C46.3 288 32 302.3 32 320C32 337.7 46.3 352 64 352L160 352L160 384L144 384C117.5 384 96 405.5 96 432L96 496C96 522.5 117.5 544 144 544L240 544C266.5 544 288 522.5 288 496L288 432C288 405.5 266.5 384 240 384L224 384L224 352L416 352L416 384L400 384C373.5 384 352 405.5 352 432L352 496C352 522.5 373.5 544 400 544L496 544C522.5 544 544 522.5 544 496L544 432C544 405.5 522.5 384 496 384L480 384L480 352L576 352C593.7 352 608 337.7 608 320C608 302.3 593.7 288 576 288L352 288L352 256L368 256C394.5 256 416 234.5 416 208L416 144C416 117.5 394.5 96 368 96L272 96zM480 440L488 440L488 488L408 488L408 440L480 440zM224 440L232 440L232 488L152 488L152 440L224 440z"
      />
      <line
        x1="108"
        y1="137.2"
        x2="564"
        y2="513.1"
        stroke="currentColor"
        strokeWidth="56"
        strokeLinecap="round"
      />
    </NetworkOffSvg>
  );
}

export type NetworkStatusIndicatorProps = {
  onPress?: () => void;
} & (
  | { isHost: true; status: HostNetworkIndicatorStatus }
  | { isHost?: false; status: NetworkIndicatorStatus }
);

/**
 * A toolbar indicator showing a machine's network status. Rendered on inverse
 * (dark) toolbar backgrounds.
 */
export function NetworkStatusIndicator(
  props: NetworkStatusIndicatorProps
): JSX.Element {
  const { onPress, isHost, status } = props;

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
    <IndicatorButton data-testid="network-status" onClick={onPress}>
      {icon}
      {label}
    </IndicatorButton>
  );
}
