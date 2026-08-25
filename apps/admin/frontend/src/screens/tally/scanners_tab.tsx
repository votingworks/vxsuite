import { useContext } from 'react';
import styled from 'styled-components';

import { Icons, Loading, Table, TD, TH } from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { Admin } from '@votingworks/types';
import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import type { MachineRecord } from '@votingworks/admin-backend';
import { getNetworkStatus, getScannerImportCounts } from '../../api.js';
import { AppContext } from '../../contexts/app_context.js';
import { GAP } from './styles.js';

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
  white-space: nowrap;
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

function ScannerStatus({ scanner }: { scanner: MachineRecord }): JSX.Element {
  if (scanner.status === Admin.ClientMachineStatus.Offline) {
    return (
      <InlineStatus>
        <Icons.Danger color="danger" /> Offline
      </InlineStatus>
    );
  }
  const { registrationError } = scanner;
  if (registrationError) {
    switch (registrationError) {
      case 'code-version-mismatch':
        return (
          <InlineStatus>
            <Icons.Danger color="danger" /> Incompatible Software
          </InlineStatus>
        );
      case 'ballot-hash-mismatch':
        return (
          <InlineStatus>
            <Icons.Warning color="warning" /> Different Election
          </InlineStatus>
        );
      case 'scanner-unconfigured':
        return (
          <InlineStatus>
            <Icons.Warning color="warning" /> Scanner Not Configured
          </InlineStatus>
        );
      case 'host-unconfigured':
        return (
          <InlineStatus>
            <Icons.Warning color="warning" /> VxAdmin Not Configured
          </InlineStatus>
        );
      // istanbul ignore next -- compile-time check
      default:
        throwIllegalValue(registrationError);
    }
  }
  return (
    <InlineStatus>
      <Icons.Done color="success" /> Connected
    </InlineStatus>
  );
}

export function ScannersTab(): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  const { election } = assertDefined(electionDefinition);
  const networkStatusQuery = getNetworkStatus.useQuery();
  const importCountsQuery = getScannerImportCounts.useQuery();

  if (!networkStatusQuery.isSuccess || !importCountsQuery.isSuccess) {
    return <Loading isFullscreen />;
  }

  const { connectedScanners } = networkStatusQuery.data;
  const importCounts = importCountsQuery.data;

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
              connectedScanners.map((scanner) => (
                <tr key={scanner.machineId}>
                  <TD>{scanner.machineId}</TD>
                  <TD>{pollingPlaceName(scanner.pollingPlaceId)}</TD>
                  <TD>
                    <ScannerStatus scanner={scanner} />
                  </TD>
                  <TD>
                    {format.count(
                      importCounts[scanner.machineId]?.cvrCount ?? 0
                    )}
                  </TD>
                  <TD>
                    {format.count(
                      importCounts[scanner.machineId]?.batchCount ?? 0
                    )}
                  </TD>
                  <TD>{format.relativeTime(scanner.lastSeenAt)}</TD>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrapper>
    </Container>
  );
}
