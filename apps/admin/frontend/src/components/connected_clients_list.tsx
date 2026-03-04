import { Card, H2, Icons, Table } from '@votingworks/ui';
import { getNetworkStatus } from '../api';

export function HostStatusPanel(): JSX.Element | null {
  const networkStatusQuery = getNetworkStatus.useQuery();
  const networkStatus = networkStatusQuery.data;

  if (!networkStatus || networkStatus.mode !== 'host') {
    return null;
  }

  const { isOnline, isPublishing, connectedClients, otherHostsDetected } =
    networkStatus;

  return (
    <Card>
      <H2>Host Status</H2>
      {!isOnline ? (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Icons.Info />
          Network offline.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p>Publishing: {isPublishing ? 'Yes' : 'No'}</p>
          {otherHostsDetected !== undefined && otherHostsDetected > 0 && (
            <Card color="danger">
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Icons.Danger color="danger" />
                Warning: {otherHostsDetected} other host(s) detected on the
                network. Only one host should be active.
              </div>
            </Card>
          )}
          {connectedClients.length === 0 ? (
            <p>No connected clients.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Machine ID</th>
                  <th>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {connectedClients.map((client) => (
                  <tr key={client.machineId}>
                    <td>{client.machineId}</td>
                    <td>{client.lastSeen}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      )}
    </Card>
  );
}
