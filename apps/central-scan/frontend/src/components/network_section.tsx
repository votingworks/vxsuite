import { throwIllegalValue } from '@votingworks/basics';
import type { NetworkConnectionInfo } from '@votingworks/central-scan-backend';
import { H2, Icons, P } from '@votingworks/ui';
import styled from 'styled-components';

const Section = styled.section`
  margin-top: 1.5em;
`;

export interface NetworkSectionProps {
  connection: NetworkConnectionInfo;
}

function ConnectionStatusMessage({
  connection,
}: NetworkSectionProps): JSX.Element {
  switch (connection.status) {
    case 'offline':
      return (
        <P>
          <Icons.Info /> Offline
        </P>
      );
    case 'online-waiting-for-host':
      return (
        <P>
          <Icons.Info /> Online &mdash; no VxAdmin detected on the network
        </P>
      );
    case 'online-multiple-hosts-detected':
      return (
        <P>
          <Icons.Danger color="danger" /> Multiple VxAdmins detected on the
          network. Ensure only one VxAdmin is connected.
        </P>
      );
    case 'online-code-version-mismatch':
      return (
        <P>
          <Icons.Danger color="danger" /> VxAdmin ({connection.hostMachineId})
          is running a different software version
        </P>
      );
    case 'online-machine-unconfigured':
      return (
        <P>
          <Icons.Info /> VxAdmin ({connection.hostMachineId}) detected on the
          network. Configure this machine with an election to connect.
        </P>
      );
    case 'online-host-unconfigured':
      return (
        <P>
          <Icons.Info /> VxAdmin ({connection.hostMachineId}) detected on the
          network, but it is not configured with an election.
        </P>
      );
    case 'online-ballot-hash-mismatch':
      return (
        <P>
          <Icons.Info /> VxAdmin ({connection.hostMachineId}) is configured for
          a different election
        </P>
      );
    // VxAdmin is reachable but won't take this machine's batches; the Scan
    // Ballots screen explains why, so the connection itself reads as fine.
    case 'online-results-official':
    case 'online-invalid-mode':
    case 'online-host-detected':
      return (
        <P>
          <Icons.Checkbox color="success" /> Online &mdash; VxAdmin (
          {connection.hostMachineId}) connected on the network
        </P>
      );
    default:
      throwIllegalValue(connection, 'status');
  }
}

export function NetworkSection({
  connection,
}: NetworkSectionProps): JSX.Element {
  return (
    <Section>
      <H2>Network</H2>
      <ConnectionStatusMessage connection={connection} />
    </Section>
  );
}
