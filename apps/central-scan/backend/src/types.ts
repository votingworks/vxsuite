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
export type NetworkConnectionStatus =
  | 'offline'
  | 'online-waiting-for-host'
  | 'online-multiple-hosts-detected'
  | 'online-code-version-mismatch'
  | 'online-machine-unconfigured'
  | 'online-host-unconfigured'
  | 'online-ballot-hash-mismatch'
  | 'online-host-detected';

/** The scanner's current connection state and the detected host, if any. */
export interface NetworkConnectionInfo {
  status: NetworkConnectionStatus;
  /**
   * Machine ID of the detected host, parsed from its avahi service name.
   * Present whenever exactly one host was found on the network.
   */
  hostMachineId?: string;
  /**
   * Address of the host the scanner is registered with. Present only in the
   * `online-host-detected` state; used by the CVR sync loop.
   */
  hostAddress?: string;
}

/** The scanner's network status, as reported to the frontend. */
export interface NetworkStatus {
  isEnabled: boolean;
  connection: NetworkConnectionInfo;
}
