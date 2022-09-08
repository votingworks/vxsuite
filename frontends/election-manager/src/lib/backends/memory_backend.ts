import {
  ElectionDefinition,
  ExternalTallySourceType,
  FullElectionExternalTallies,
  FullElectionExternalTally,
  Iso8601Timestamp,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { assert } from '@votingworks/utils';
import { PrintedBallot } from '../../config/types';
import { CastVoteRecordFiles } from '../../utils/cast_vote_record_files';
import { ElectionManagerStoreBackend } from './types';

/**
 * An in-memory backend for ElectionManagerStore. Useful for tests or an
 * ephemeral session.
 */
export class ElectionManagerStoreMemoryBackend
  implements ElectionManagerStoreBackend
{
  private electionDefinition?: ElectionDefinition;
  private configuredAt?: Iso8601Timestamp;
  private printedBallots?: readonly PrintedBallot[];
  private fullElectionExternalTallies: Map<
    ExternalTallySourceType,
    FullElectionExternalTally
  >;
  private castVoteRecordFiles?: CastVoteRecordFiles;
  private isOfficialResults?: boolean;

  constructor({
    electionDefinition,
    configuredAt,
    printedBallots,
    fullElectionExternalTallies,
    castVoteRecordFiles,
    isOfficialResults,
  }: {
    electionDefinition?: ElectionDefinition;
    configuredAt?: Iso8601Timestamp;
    printedBallots?: readonly PrintedBallot[];
    fullElectionExternalTallies?: FullElectionExternalTallies;
    castVoteRecordFiles?: CastVoteRecordFiles;
    isOfficialResults?: boolean;
  } = {}) {
    this.electionDefinition = electionDefinition;
    this.configuredAt =
      configuredAt ??
      (electionDefinition ? new Date().toISOString() : undefined);
    this.printedBallots = printedBallots;
    this.fullElectionExternalTallies = new Map([
      ...(fullElectionExternalTallies ?? []),
    ]);
    this.castVoteRecordFiles = castVoteRecordFiles;
    this.isOfficialResults = isOfficialResults;
  }

  async reset(): Promise<void> {
    await Promise.resolve();
    this.electionDefinition = undefined;
    this.configuredAt = undefined;
    this.printedBallots = undefined;
    this.fullElectionExternalTallies = new Map();
    this.castVoteRecordFiles = undefined;
    this.isOfficialResults = undefined;
  }

  async loadElectionDefinitionAndConfiguredAt(): Promise<
    { electionDefinition: ElectionDefinition; configuredAt: string } | undefined
  > {
    await Promise.resolve();
    if (this.electionDefinition && this.configuredAt) {
      return {
        electionDefinition: this.electionDefinition,
        configuredAt: this.configuredAt,
      };
    }
  }

  async configure(newElectionData: string): Promise<ElectionDefinition> {
    await this.reset();

    const parseResult = safeParseElectionDefinition(newElectionData);

    if (parseResult.isErr()) {
      throw parseResult.err();
    }

    this.electionDefinition = parseResult.ok();
    this.configuredAt = new Date().toISOString();

    return this.electionDefinition;
  }

  loadCastVoteRecordFiles(): Promise<CastVoteRecordFiles | undefined> {
    return Promise.resolve(this.castVoteRecordFiles);
  }

  async addCastVoteRecordFile(newCastVoteRecordFile: File): Promise<void> {
    if (!this.electionDefinition) {
      throw new Error('Election definition must be configured first');
    }

    this.castVoteRecordFiles = await (
      this.castVoteRecordFiles ?? CastVoteRecordFiles.empty
    ).add(newCastVoteRecordFile, this.electionDefinition.election);
  }

  async clearCastVoteRecordFiles(): Promise<void> {
    await Promise.resolve();
    this.isOfficialResults = undefined;
    this.castVoteRecordFiles = undefined;
  }

  loadFullElectionExternalTallies(): Promise<
    FullElectionExternalTallies | undefined
  > {
    return Promise.resolve(new Map(this.fullElectionExternalTallies));
  }

  async updateFullElectionExternalTally(
    sourceType: ExternalTallySourceType,
    newFullElectionExternalTally: FullElectionExternalTally
  ): Promise<void> {
    await Promise.resolve();
    assert(newFullElectionExternalTally.source === sourceType);
    this.fullElectionExternalTallies.set(
      sourceType,
      newFullElectionExternalTally
    );
  }

  async removeFullElectionExternalTally(
    sourceType: ExternalTallySourceType
  ): Promise<void> {
    await Promise.resolve();
    this.fullElectionExternalTallies.delete(sourceType);
  }

  async clearFullElectionExternalTallies(): Promise<void> {
    await Promise.resolve();
    this.fullElectionExternalTallies = new Map();
  }

  loadIsOfficialResults(): Promise<boolean | undefined> {
    return Promise.resolve(this.isOfficialResults);
  }

  async markResultsOfficial(): Promise<void> {
    await Promise.resolve();
    this.isOfficialResults = true;
  }

  loadPrintedBallots(): Promise<PrintedBallot[] | undefined> {
    return Promise.resolve(this.printedBallots?.slice());
  }

  async addPrintedBallot(printedBallot: PrintedBallot): Promise<void> {
    await Promise.resolve();
    this.printedBallots = [...(this.printedBallots ?? []), printedBallot];
  }
}
