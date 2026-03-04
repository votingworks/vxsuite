import { Card, H2, Table } from '@votingworks/ui';
import { getNetworkStatus } from '../api';

export function ConnectedClientsList(): JSX.Element | null {
  const networkStatusQuery = getNetworkStatus.useQuery();
  const networkStatus = networkStatusQuery.data;

  if (!networkStatus || networkStatus.mode !== 'host') {
    return null;
  }

  const { isPublishing, connectedClients } = networkStatus;

  return (
    <Card>
      <H2>Host Status</H2>
      <p>Publishing: {isPublishing ? 'Yes' : 'No'}</p>
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
    </Card>
  );
}
