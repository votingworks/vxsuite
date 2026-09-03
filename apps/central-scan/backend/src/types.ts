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
  /** The host's results are marked official, so it accepts no more CVRs. */
  | 'online-results-official'
  /** The host is locked to the other test/official ballot mode. */
  | 'online-invalid-mode'
  | 'online-host-detected';

/**
 * The scanner's current connection state and, once exactly one host has been
 * found on the network, details about that host. Discriminated on `status` so
 * each state carries exactly the details it has.
 */
export type NetworkConnectionInfo =
  | {
      status:
        | 'offline'
        | 'online-waiting-for-host'
        | 'online-multiple-hosts-detected';
    }
  | {
      status:
        | 'online-code-version-mismatch'
        | 'online-machine-unconfigured'
        | 'online-host-unconfigured'
        | 'online-ballot-hash-mismatch'
        | 'online-results-official';
      /** Machine ID of the detected host, parsed from its avahi service name. */
      hostMachineId: string;
    }
  | {
      status: 'online-invalid-mode';
      hostMachineId: string;
      /** The ballot mode the host's existing CVRs lock it to. */
      hostCvrFileMode: 'test' | 'official';
    }
  | {
      status: 'online-host-detected';
      hostMachineId: string;
      /** Address of the host's peer API, used by the CVR sync loop. */
      hostAddress: string;
    };

/** The scanner's network status, as reported to the frontend. */
export interface NetworkStatus {
  isEnabled: boolean;
  connection: NetworkConnectionInfo;
}
