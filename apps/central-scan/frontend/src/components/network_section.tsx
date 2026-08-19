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
    case 'online-host-detected':
      return (
        <P>
          <Icons.Checkbox color="success" /> Online &mdash; VxAdmin (
          {connection.hostMachineId}) detected on the network
        </P>
      );
    // istanbul ignore next -- compile-time check
    default:
      throwIllegalValue(connection.status);
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
