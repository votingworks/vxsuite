/* eslint-disable max-classes-per-file */
import {
  CAST_VOTE_RECORD_HASHES_TABLE_SCHEMA,
  clearCastVoteRecordHashes,
  getCastVoteRecordRootHash,
  updateCastVoteRecordHashes,
} from '@votingworks/auth';
import { Client } from '@votingworks/db';
import {
  BatchInfo,
  DEFAULT_MARK_THRESHOLDS,
  ElectionDefinition,
  MarkThresholds,
  PollsState,
  SystemSettings,
} from '@votingworks/types';
import { FileSystemEntryType, listDirectoryRecursive } from '@votingworks/fs';
import {
  CentralScannerStore,
  ElectionRecord,
  PrecinctScannerStore,
  ScannerStoreBase,
} from '../src/cast_vote_records/export';

class MockScannerStoreBase implements ScannerStoreBase {
  private batches: BatchInfo[];
  private readonly client: Client;
  private electionDefinition?: ElectionDefinition;
  private systemSettings?: SystemSettings;
  private testMode: boolean;

  constructor() {
    this.batches = [];
    this.client = Client.memoryClient();
    this.electionDefinition = undefined;
    this.testMode = true;

    this.client.exec(CAST_VOTE_RECORD_HASHES_TABLE_SCHEMA);
  }

  clearCastVoteRecordHashes(): void {
    return clearCastVoteRecordHashes(this.client);
  }

  getBatches(): BatchInfo[] {
    return this.batches;
  }

  getCastVoteRecordRootHash(): string {
    return getCastVoteRecordRootHash(this.client);
  }

  getElectionRecord(): ElectionRecord | undefined {
    return (
      this.electionDefinition && {
        electionDefinition: this.electionDefinition,
        electionPackageHash: 'test-election-package-hash',
      }
    );
  }

  getSystemSettings(): SystemSettings | undefined {
    return this.systemSettings;
  }

  getMarkThresholds(): MarkThresholds {
    return DEFAULT_MARK_THRESHOLDS;
  }

  getTestMode(): boolean {
    return this.testMode;
  }

  updateCastVoteRecordHashes(
    castVoteRecordId: string,
    castVoteRecordHash: string
  ): void {
    return updateCastVoteRecordHashes(
      this.client,
      castVoteRecordId,
      castVoteRecordHash
    );
  }

  //
  // Methods to facilitate testing, beyond the ScannerStore interface
  //

  setBatches(batches: BatchInfo[]): void {
    this.batches = batches;
  }

  setElectionDefinition(electionDefinition?: ElectionDefinition): void {
    this.electionDefinition = electionDefinition;
  }

  setSystemSettings(systemSettings?: SystemSettings): void {
    this.systemSettings = systemSettings;
  }

  setTestMode(testMode: boolean): void {
    this.testMode = testMode;
  }
}

/**
 * A mock central scanner store
 */
export class MockCentralScannerStore
  extends MockScannerStoreBase
  implements CentralScannerStore
{
  // eslint-disable-next-line vx/gts-no-public-class-fields
  readonly scannerType = 'central';
}

/**
 * A mock precinct scanner store
 */
export class MockPrecinctScannerStore
  extends MockScannerStoreBase
  implements PrecinctScannerStore
{
  // eslint-disable-next-line vx/gts-no-public-class-fields
  readonly scannerType = 'precinct';

  private ballotsCounted: number;
  private exportDirectoryName?: string;
  private isContinuousExportEnabled: boolean;
  private pendingContinuousExportOperations: string[];
  private pollsState: PollsState;

  constructor() {
    super();
    this.ballotsCounted = 0;
    this.exportDirectoryName = undefined;
    this.isContinuousExportEnabled = true;
    this.pendingContinuousExportOperations = [];
    this.pollsState = 'polls_closed_initial';
  }

  deleteAllPendingContinuousExportOperations(): void {
    this.pendingContinuousExportOperations = [];
  }

  deletePendingContinuousExportOperation(sheetIdToDelete: string): void {
    this.pendingContinuousExportOperations =
      this.pendingContinuousExportOperations.filter(
        (sheetId) => sheetId !== sheetIdToDelete
      );
  }

  getBallotsCounted(): number {
    return this.ballotsCounted;
  }

  getExportDirectoryName(): string | undefined {
    return this.exportDirectoryName;
  }

  getIsContinuousExportEnabled(): boolean {
    return this.isContinuousExportEnabled;
  }

  getPendingContinuousExportOperations(): string[] {
    return this.pendingContinuousExportOperations;
  }

  getPollsState(): PollsState {
    return this.pollsState;
  }

  setExportDirectoryName(exportDirectoryName: string): void {
    this.exportDirectoryName = exportDirectoryName;
  }

  //
  // Methods to facilitate testing, beyond the ScannerStore interface
  //

  addPendingContinuousExportOperation(sheetId: string): void {
    this.pendingContinuousExportOperations.push(sheetId);
  }

  setBallotsCounted(ballotsCounted: number): void {
    this.ballotsCounted = ballotsCounted;
  }

  setIsContinuousExportEnabled(isContinuousExportEnabled: boolean): void {
    this.isContinuousExportEnabled = isContinuousExportEnabled;
  }

  setPollsState(pollsState: PollsState): void {
    this.pollsState = pollsState;
  }
}

/**
 * Summarizes the contents of a directory, e.g.
 * ```
 * summarizeDirectoryContents('/path/to/directory') => [
 *   'file-1.txt'
 *   'sub-directory-1/file-2.txt',
 *   'sub-directory-1/file-3.txt',
 *   'sub-directory-1/sub-directory-2/file-4.txt,
 * ]
 * ```
 */
export async function summarizeDirectoryContents(
  directoryPath: string
): Promise<string[]> {
  const filePathsRelativeToDirectoryPath: string[] = [];
  for await (const entryResult of listDirectoryRecursive(directoryPath)) {
    const entry = entryResult.unsafeUnwrap();
    if (entry.type === FileSystemEntryType.File) {
      filePathsRelativeToDirectoryPath.push(
        entry.path.replace(`${directoryPath}/`, '')
      );
    }
  }
  return [...filePathsRelativeToDirectoryPath].sort();
}
