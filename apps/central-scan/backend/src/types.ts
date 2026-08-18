import { BallotPageLayout, BatchInfo, Rect } from '@votingworks/types';

export interface MachineConfig {
  machineId: string;
  codeVersion: string;
}

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

/**
 * Connection status of this scanner in a networked central-scan setup.
 * Mirrors VxAdmin's ClientConnectionStatus naming. A string union rather
 * than an enum so the frontend can use it via type-only imports.
 */
export type ScannerConnectionStatus =
  | 'offline'
  | 'online-waiting-for-host'
  | 'online-host-detected';

/** The scanner's current connection state and the detected host, if any. */
export interface ScannerConnectionInfo {
  status: ScannerConnectionStatus;
  /** Machine ID of the detected host, parsed from its avahi service name. */
  hostMachineId?: string;
}

/** The scanner's network status, as reported to the frontend. */
export interface NetworkStatus {
  isEnabled: boolean;
  connection: ScannerConnectionInfo;
}
