import type { Result } from '@votingworks/basics';
import type { Api } from '@votingworks/grout';
import type { ElectionDefinition } from '@votingworks/types';

/** Machine config reported by a VxAdmin host. */
export interface VxAdminHostMachineConfig {
  machineId: string;
  codeVersion: string;
}

/**
 * Why a VxAdmin host refused to register a scanner. Registration is refused
 * whenever the host could not accept the scanner's cast vote records, so the
 * scanner's connection status reflects every such condition and no batch is
 * sent into a known refusal.
 */
export type RegisterScannerError =
  | { type: 'code-version-mismatch' }
  | { type: 'scanner-unconfigured' }
  | { type: 'host-unconfigured' }
  | { type: 'ballot-hash-mismatch' }
  /** The host's results have been marked official; it accepts no more CVRs. */
  | { type: 'results-official' }
  /**
   * The host's existing CVRs lock it to `currentMode`, and the scanner is in
   * the other mode.
   */
  | { type: 'invalid-mode'; currentMode: 'test' | 'official' };

/** What a VxAdmin host returns to a scanner it has registered. */
export interface ScannerRegistration extends VxAdminHostMachineConfig {
  /**
   * IDs of this scanner's batches whose cast vote records the host currently
   * holds. Lets the scanner notice a batch that was removed on the host.
   */
  importedBatchIds: string[];
}

/**
 * Manifest describing one scanned batch being transferred to a VxAdmin host.
 * Mirrors the per-batch entries in a USB cast vote record export's batch
 * manifest.
 */
export interface CvrTransferManifest {
  machineId: string;
  batchId: string;
  label: string;
  pollingPlaceId: string;
  sheetCount: number;
  /** ISO 8601 timestamp of when the batch was started. */
  startedAt: string;
  isTestMode: boolean;
}

/**
 * Why a VxAdmin host refused to start a CVR transfer. The same checks as
 * registration, re-run at transfer time because the host's state can change
 * between heartbeats.
 */
export type StartCvrTransferError = RegisterScannerError;

/** Why a VxAdmin host refused to finish a CVR transfer. */
export type FinishCvrTransferError =
  | { type: 'transfer-not-found' }
  | { type: 'sheet-count-mismatch'; expected: number; received: number }
  | { type: 'import-failed'; subType: string }
  | { type: 'results-official' }
  | { type: 'invalid-mode'; currentMode: 'test' | 'official' };

/**
 * The path of the host's (non-grout) CVR upload endpoint. One request per
 * cast vote record, with an `application/zip` body containing the record's
 * file set (report JSON, ballot images, and, for HMPBs, layout files) as
 * flat entries.
 */
export function getCvrTransferUploadPath(
  scannerMachineId: string,
  batchId: string,
  castVoteRecordId: string
): string {
  return `/api/cvr-transfer/${encodeURIComponent(
    scannerMachineId
  )}/${encodeURIComponent(batchId)}/${encodeURIComponent(castVoteRecordId)}`;
}

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
    /** Whether the scanner is in test ballot mode. */
    isTestMode: boolean;
  }) => Result<ScannerRegistration, RegisterScannerError>;
  /**
   * Read-only, side-effect-free method also used by scanners as a
   * reachability probe when verifying advertised hosts.
   */
  getCurrentElectionMetadata: () =>
    | { electionDefinition: ElectionDefinition }
    | undefined;
  /**
   * Starts (or resumes) transferring one batch of cast vote records. The
   * import record keyed by (scanner machineId, batchId) is the only transfer
   * state, so re-starting an interrupted transfer is always safe. Returns
   * `alreadyComplete: true` if the batch was already fully imported.
   *
   * The scanner then uploads one zip per cast vote record (see
   * {@link getCvrTransferUploadPath}) and calls `finishCvrTransfer`.
   */
  startCvrTransfer: (
    input: CvrTransferManifest & {
      codeVersion: string;
      ballotHash: string;
    }
  ) => Promise<Result<{ alreadyComplete: boolean }, StartCvrTransferError>>;
  /**
   * Completes a transfer started with `startCvrTransfer`: verifies the
   * received cast vote records against the manifest's sheet count, imports
   * them, and makes the import visible. Idempotent.
   */
  finishCvrTransfer: (input: {
    machineId: string;
    batchId: string;
  }) => Promise<Result<{ cvrCount: number }, FinishCvrTransferError>>;
}>;
