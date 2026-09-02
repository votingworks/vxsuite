import { Icons } from '@votingworks/ui';
import styled from 'styled-components';
import { throwIllegalValue } from '@votingworks/basics';
import type { NetworkConnectionStatus } from '@votingworks/admin-backend';

const Row = styled.div`
  display: flex;
  flex-direction: row;
  gap: 0.5rem;
  align-items: center;
`;

/**
 * Surfaces why an adjudication station isn't ready to adjudicate. Only meant
 * to render when something needs the user's attention
 *
 * For the `online-connected-to-host` status this assumes the host has no
 * election configured.
 */
export function UnconfiguredNetworkStatusIndicator({
  status,
}: {
  status: NetworkConnectionStatus;
}): JSX.Element {
  switch (status.status) {
    case 'online-connected-to-host':
      return (
        <Row>
          <Icons.Warning color="warning" />
          The host is not configured with an election
        </Row>
      );
    case 'online-waiting-for-host':
      return (
        <Row>
          <Icons.Warning color="warning" />
          No host detected
        </Row>
      );
    case 'online-multiple-hosts-detected':
      return (
        <Row>
          <Icons.Danger color="danger" />
          Multiple hosts detected on the network
        </Row>
      );
    case 'online-incompatible-host-version':
      return (
        <Row>
          <Icons.Danger color="danger" />
          The software version of this adjudication station does not match the
          software version of the host
        </Row>
      );
    case 'offline':
      return (
        <Row>
          <Icons.Danger color="danger" />
          No network connection
        </Row>
      );
    default:
      throwIllegalValue(status);
  }
}
