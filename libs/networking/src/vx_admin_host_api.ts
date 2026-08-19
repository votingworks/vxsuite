import type { Result } from '@votingworks/basics';
import type { Api } from '@votingworks/grout';
import type { ElectionDefinition } from '@votingworks/types';

/** Machine config reported by a VxAdmin host. */
export interface VxAdminHostMachineConfig {
  machineId: string;
  codeVersion: string;
}

/** Why a VxAdmin host refused to register a scanner. */
export type RegisterScannerError =
  | { type: 'code-version-mismatch' }
  | { type: 'scanner-unconfigured' }
  | { type: 'host-unconfigured' }
  | { type: 'ballot-hash-mismatch' };

/**
 * The subset of VxAdmin's peer API used by networked central scanners.
 * VxAdmin's peer API statically implements this contract (via `satisfies` in
 * `apps/admin/backend/src/peer_app.ts`), so the two cannot drift apart.
 */
export type VxAdminHostApi = Api<{
  registerScanner: (input: {
    machineId: string;
    codeVersion: string;
    /** The scanner's configured election, if any. */
    ballotHash?: string;
    /** The polling place the scanner is configured for, if any. */
    pollingPlaceId?: string;
  }) => Result<VxAdminHostMachineConfig, RegisterScannerError>;
  /**
   * Read-only, side-effect-free method also used by scanners as a
   * reachability probe when verifying advertised hosts.
   */
  getCurrentElectionMetadata: () =>
    | { electionDefinition: ElectionDefinition }
    | undefined;
}>;
