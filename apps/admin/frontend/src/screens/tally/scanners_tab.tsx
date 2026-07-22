import { useContext } from 'react';
import styled from 'styled-components';

import { Icons, Loading, Table, TD, TH } from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { Admin } from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { getNetworkStatus } from '../../api';
import { AppContext } from '../../contexts/app_context';
import { GAP } from './styles';

const Container = styled.div`
  height: 100%;
  overflow-y: auto;
  padding: 0 ${GAP};
`;

const EmptyTableMessage = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  color: ${(p) => p.theme.colors.onBackgroundMuted};
`;

const InlineStatus = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const StatusDot = styled(Icons.CircleSolid)`
  font-size: 0.625em;
`;

const TableWrapper = styled.div`
  & th,
  & td {
    padding: 0.625rem 1rem;
  }

  & tbody tr:last-child td {
    border-bottom: none;
  }
`;

export function ScannersTab(): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  const { election } = assertDefined(electionDefinition);
  const networkStatusQuery = getNetworkStatus.useQuery();

  if (!networkStatusQuery.isSuccess) {
    return <Loading isFullscreen />;
  }

  const { connectedScanners } = networkStatusQuery.data;

  function pollingPlaceName(pollingPlaceId: string | null): string {
    if (!pollingPlaceId) return '—';
    const pollingPlace = election.pollingPlaces.find(
      (p) => p.id === pollingPlaceId
    );
    return pollingPlace?.name ?? pollingPlaceId;
  }

  return (
    <Container>
      <TableWrapper>
        <Table>
          <thead>
            <tr>
              <TH>Scanner</TH>
              <TH>Polling Place</TH>
              <TH>Status</TH>
              <TH>CVRs</TH>
              <TH>Batches</TH>
              <TH>Last Seen</TH>
            </tr>
          </thead>
          <tbody>
            {connectedScanners.length === 0 ? (
              <tr>
                <TD colSpan={6}>
                  <EmptyTableMessage>
                    <Icons.Loading /> Waiting for central scanners to connect…
                  </EmptyTableMessage>
                </TD>
              </tr>
            ) : (
              connectedScanners.map((scanner) => {
                const isOffline =
                  scanner.status === Admin.ClientMachineStatus.Offline;
                return (
                  <tr key={scanner.machineId}>
                    <TD>{scanner.machineId}</TD>
                    <TD>{pollingPlaceName(scanner.pollingPlaceId)}</TD>
                    <TD>
                      {isOffline ? (
                        <InlineStatus>
                          <StatusDot /> Offline
                        </InlineStatus>
                      ) : (
                        <InlineStatus>
                          <StatusDot color="success" /> Connected
                        </InlineStatus>
                      )}
                    </TD>
                    <TD>{format.count(scanner.importedCvrCount)}</TD>
                    <TD>{format.count(scanner.importedBatchCount)}</TD>
                    <TD>{format.relativeTime(scanner.lastSeenAt)}</TD>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </TableWrapper>
    </Container>
  );
}
