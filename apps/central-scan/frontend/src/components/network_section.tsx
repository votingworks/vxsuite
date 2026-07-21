import { throwIllegalValue } from '@votingworks/basics';
import type {
  CvrSyncStatus,
  HostConnectionInfo,
} from '@votingworks/central-scan-backend';
import { H2, Icons, P } from '@votingworks/ui';
import { format } from '@votingworks/utils';
import styled from 'styled-components';

const Section = styled.section`
  margin-top: 1.5em;
`;

export interface NetworkSectionProps {
  hostConnectionInfo: HostConnectionInfo;
  cvrSyncStatus: CvrSyncStatus;
}

function HostConnectionStatusMessage({
  hostConnectionInfo,
}: {
  hostConnectionInfo: HostConnectionInfo;
}): JSX.Element {
  switch (hostConnectionInfo.status) {
    case 'offline':
      return (
        <P>
          <Icons.Info /> Offline
        </P>
      );
    case 'waiting-for-host':
      return (
        <P>
          <Icons.Info /> Online &mdash; no VxAdmin detected on the network
        </P>
      );
    case 'connected-to-host':
      return (
        <P>
          <Icons.Checkbox color="success" /> Online &mdash; connected to VxAdmin
          ({hostConnectionInfo.hostMachineId})
        </P>
      );
    case 'multiple-hosts-detected':
      return (
        <P>
          <Icons.Warning color="warning" /> Multiple VxAdmins detected on the
          network
        </P>
      );
    case 'election-mismatch':
      return (
        <P>
          <Icons.Warning color="warning" /> The VxAdmin on the network is
          configured for a different election
        </P>
      );
    // istanbul ignore next -- compile-time check
    default:
      throwIllegalValue(hostConnectionInfo.status);
  }
}

function CvrSyncStatusMessage({
  cvrSyncStatus,
}: {
  cvrSyncStatus: CvrSyncStatus;
}): JSX.Element {
  if (cvrSyncStatus.state === 'syncing') {
    const { currentBatch } = cvrSyncStatus;
    return (
      <P>
        <Icons.Loading />{' '}
        {currentBatch
          ? `Sending ${currentBatch.label} to VxAdmin (${currentBatch.sheetsSent} of ${currentBatch.sheetsTotal} sheets)…`
          : 'Sending CVRs to VxAdmin…'}
      </P>
    );
  }
  if (cvrSyncStatus.unsentBatchCount > 0) {
    return (
      <P>
        <Icons.Warning color="warning" />{' '}
        {format.count(cvrSyncStatus.unsentBatchCount)}{' '}
        {cvrSyncStatus.unsentBatchCount === 1 ? 'batch' : 'batches'} waiting to
        be sent to VxAdmin
      </P>
    );
  }
  return (
    <P>
      <Icons.Checkbox color="success" /> All saved batches have been sent to
      VxAdmin
    </P>
  );
}

export function NetworkSection({
  hostConnectionInfo,
  cvrSyncStatus,
}: NetworkSectionProps): JSX.Element {
  return (
    <Section>
      <H2>Network</H2>
      <HostConnectionStatusMessage hostConnectionInfo={hostConnectionInfo} />
      <CvrSyncStatusMessage cvrSyncStatus={cvrSyncStatus} />
      {cvrSyncStatus.lastError && (
        <P>
          <Icons.Warning color="warning" /> Last send attempt failed:{' '}
          {cvrSyncStatus.lastError}
        </P>
      )}
    </Section>
  );
}
