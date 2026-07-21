import {
  BallotPageLayout,
  BatchInfo,
  ExportCastVoteRecordsToUsbDriveError,
  Iso8601Timestamp,
  Rect,
} from '@votingworks/types';

export interface MachineConfig {
  machineId: string;
  codeVersion: string;
}

/** Connection status from this scanner to a VxAdmin host. */
export type HostConnectionStatus =
  | 'offline'
  | 'waiting-for-host'
  | 'connected-to-host'
  | 'multiple-hosts-detected'
  | 'election-mismatch';

/** Summary of the scanner's connection to a VxAdmin host. */
export interface HostConnectionInfo {
  status: HostConnectionStatus;
  hostMachineId?: string;
}

/** An error encountered while sending cast vote records to a VxAdmin host. */
export type SendCastVoteRecordsToHostError =
  | { type: 'no-host-connected' }
  | { type: 'export-failed'; error: ExportCastVoteRecordsToUsbDriveError }
  | { type: 'upload-failed'; message: string };

/**
 * Status of the background sync that sends saved batches to a VxAdmin host.
 */
export interface CvrSyncStatus {
  state: 'idle' | 'syncing';
  unsentBatchCount: number;
  /** The batch currently being sent, when `state` is `'syncing'`. */
  currentBatch?: {
    batchId: string;
    label: string;
    sheetsSent: number;
    sheetsTotal: number;
  };
  lastError?: string;
}

/**
 * A batch along with the central-scan-local record of when it was sent to a
 * VxAdmin host.
 */
export interface BatchInfoWithSyncStatus extends BatchInfo {
  sentToAdminAt?: Iso8601Timestamp;
}

export type ScanState = 'idle' | 'scanning' | 'adjudication';

/** Why an in-progress batch is paused. */
export type BatchPauseReason =
  | 'tray-empty'
  | 'stopped'
  | 'ballot-review'
  | 'error';

/**
 * The batch currently being scanned. A batch stays open when scanning is
 * interrupted (tray empty, operator stop, or a ballot needing review) until
 * the operator continues, saves, or cancels it.
 */
export interface CurrentBatchStatus {
  batchId: BatchInfo['id'];
  state: 'scanning' | 'paused';
  pauseReason?: BatchPauseReason;
}

export interface ScanStatus {
  isScannerAttached: boolean;
  currentBatch?: CurrentBatchStatus;
  adjudicationsRemaining: number;
  batches: BatchInfoWithSyncStatus[];
  /** The number the next batch will be assigned (discards free their number). */
  nextBatchNumber: number;
  canUnconfigure: boolean;
}

export interface BallotImage {
  imageUrl: string;
  ballotBounds: Rect;
  layout?: BallotPageLayout;
}
