import {
  ElectionDefinition,
  FullElectionExternalTally,
  Iso8601Timestamp,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { PrintedBallot } from '../../config/types';
import { ElectionManagerStoreBackend } from './types';
import { CastVoteRecordFiles } from '../../utils/cast_vote_record_files';

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
  private fullElectionExternalTallies?: readonly FullElectionExternalTally[];
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
    fullElectionExternalTallies?: readonly FullElectionExternalTally[];
    castVoteRecordFiles?: CastVoteRecordFiles;
    isOfficialResults?: boolean;
  } = {}) {
    this.electionDefinition = electionDefinition;
    this.configuredAt =
      configuredAt ??
      (electionDefinition ? new Date().toISOString() : undefined);
    this.printedBallots = printedBallots;
    this.fullElectionExternalTallies = fullElectionExternalTallies;
    this.castVoteRecordFiles = castVoteRecordFiles;
    this.isOfficialResults = isOfficialResults;
  }

  async reset(): Promise<void> {
    await Promise.resolve();
    this.electionDefinition = undefined;
    this.configuredAt = undefined;
    this.printedBallots = undefined;
    this.fullElectionExternalTallies = undefined;
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

  async setCastVoteRecordFiles(
    newCastVoteRecordFiles: CastVoteRecordFiles
  ): Promise<void> {
    await Promise.resolve();
    if (newCastVoteRecordFiles === CastVoteRecordFiles.empty) {
      this.isOfficialResults = undefined;
      this.castVoteRecordFiles = undefined;
    } else {
      this.castVoteRecordFiles = newCastVoteRecordFiles;
    }
  }

  async clearCastVoteRecordFiles(): Promise<void> {
    await this.setCastVoteRecordFiles(CastVoteRecordFiles.empty);
  }

  loadFullElectionExternalTallies(): Promise<
    FullElectionExternalTally[] | undefined
  > {
    return Promise.resolve(this.fullElectionExternalTallies?.slice());
  }

  async addFullElectionExternalTally(
    newFullElectionExternalTally: FullElectionExternalTally
  ): Promise<void> {
    await this.setFullElectionExternalTallies([
      ...(this.fullElectionExternalTallies ?? []),
      newFullElectionExternalTally,
    ]);
  }

  async setFullElectionExternalTallies(
    newFullElectionExternalTallies: readonly FullElectionExternalTally[]
  ): Promise<void> {
    await Promise.resolve();
    this.fullElectionExternalTallies = newFullElectionExternalTallies;
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
