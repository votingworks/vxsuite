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
} from '@votingworks/types';

import { ScannerStore } from '../src/cast_vote_records/export';

class MockScannerStore implements ScannerStore {
  private ballotsCounted: number;
  private batches: BatchInfo[];
  private readonly client: Client;
  private electionDefinition?: ElectionDefinition;
  private testMode: boolean;

  constructor() {
    this.ballotsCounted = 0;
    this.batches = [];
    this.client = Client.memoryClient();
    this.electionDefinition = undefined;
    this.testMode = true;

    this.client.exec(CAST_VOTE_RECORD_HASHES_TABLE_SCHEMA);
  }

  //
  // Cast vote record hash methods
  //

  getCastVoteRecordRootHash(): string {
    return getCastVoteRecordRootHash(this.client);
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

  clearCastVoteRecordHashes(): void {
    return clearCastVoteRecordHashes(this.client);
  }

  //
  // Other getters
  //

  getBatches(): BatchInfo[] {
    return this.batches;
  }

  getElectionDefinition(): ElectionDefinition | undefined {
    return this.electionDefinition;
  }

  getMarkThresholds(): MarkThresholds {
    return DEFAULT_MARK_THRESHOLDS;
  }

  getTestMode(): boolean {
    return this.testMode;
  }

  //
  // Methods to facilitate testing, beyond the ScannerStore interface
  //

  getBallotsCounted(): number {
    return this.ballotsCounted;
  }

  setBallotsCounted(ballotsCounted: number): void {
    this.ballotsCounted = ballotsCounted;
  }

  setBatches(batches: BatchInfo[]): void {
    this.batches = batches;
  }

  setElectionDefinition(electionDefinition?: ElectionDefinition): void {
    this.electionDefinition = electionDefinition;
  }

  setTestMode(testMode: boolean): void {
    this.testMode = testMode;
  }
}

/**
 * A mock central scanner store
 */
export class MockCentralScannerStore extends MockScannerStore {
  constructor() {
    super();
    process.env['VX_MACHINE_TYPE'] = 'central-scan';
  }
}

/**
 * A mock precinct scanner store
 */
export class MockPrecinctScannerStore extends MockScannerStore {
  private exportDirectoryName?: string;
  private pollsState: PollsState;

  constructor() {
    super();
    this.exportDirectoryName = undefined;
    this.pollsState = 'polls_closed_initial';
    process.env['VX_MACHINE_TYPE'] = 'scan';
  }

  getExportDirectoryName(): string | undefined {
    return this.exportDirectoryName;
  }

  setExportDirectoryName(exportDirectoryName: string): void {
    this.exportDirectoryName = exportDirectoryName;
  }

  getPollsState(): PollsState {
    return this.pollsState;
  }

  setPollsState(pollsState: PollsState): void {
    this.pollsState = pollsState;
  }
}
