import type {
  BatchInfoWithSyncStatus,
  CvrSyncStatus,
} from '@votingworks/central-scan-backend';
import { shortDateTime } from '../util/date_time';

export function BatchSyncIndicator({
  batch,
  cvrSyncStatus,
}: {
  batch: BatchInfoWithSyncStatus;
  cvrSyncStatus?: CvrSyncStatus;
}): JSX.Element {
  const { currentBatch } = cvrSyncStatus ?? {};
  if (currentBatch?.batchId === batch.id) {
    return <span>Sending&hellip;</span>;
  }
  if (batch.sentToAdminAt) {
    return <span>{shortDateTime(batch.sentToAdminAt)}</span>;
  }
  return <span>Waiting to send</span>;
}
