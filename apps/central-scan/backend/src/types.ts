import {
  BallotPageLayout,
  BatchInfo,
  ExportCastVoteRecordsToUsbDriveError,
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
  | 'incompatible-host-version';

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

export type ScanState = 'idle' | 'scanning' | 'adjudication';

export interface ScanStatus {
  isScannerAttached: boolean;
  ongoingBatchId?: BatchInfo['id'];
  adjudicationsRemaining: number;
  batches: BatchInfo[];
  canUnconfigure: boolean;
}

export interface BallotImage {
  imageUrl: string;
  ballotBounds: Rect;
  layout?: BallotPageLayout;
}
