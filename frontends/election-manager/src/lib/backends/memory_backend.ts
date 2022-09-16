import { Admin } from '@votingworks/api';
import {
  ContestId,
  ElectionDefinition,
  ExternalTallySourceType,
  FullElectionExternalTallies,
  FullElectionExternalTally,
  Iso8601Timestamp,
  safeParseElectionDefinition,
} from '@votingworks/types';
import {
  assert,
  castVoteRecordVoteIsWriteIn,
  castVoteRecordVotes,
} from '@votingworks/utils';
import { v4 as uuid } from 'uuid';
import { CastVoteRecordFile, PrintedBallot } from '../../config/types';
import { CastVoteRecordFiles } from '../../utils/cast_vote_record_files';
import {
  AddCastVoteRecordFileResult,
  ElectionManagerStoreBackend,
} from './types';

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
  private writeIns?: readonly Admin.WriteInRecord[];

  constructor({
    electionDefinition,
    configuredAt,
    printedBallots,
    fullElectionExternalTallies,
    castVoteRecordFiles,
    isOfficialResults,
    writeIns,
  }: {
    electionDefinition?: ElectionDefinition;
    configuredAt?: Iso8601Timestamp;
    printedBallots?: readonly PrintedBallot[];
    fullElectionExternalTallies?: FullElectionExternalTallies;
    castVoteRecordFiles?: CastVoteRecordFiles;
    isOfficialResults?: boolean;
    writeIns?: readonly Admin.WriteInRecord[];
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
    this.writeIns = writeIns;
  }

  async reset(): Promise<void> {
    await Promise.resolve();
    this.electionDefinition = undefined;
    this.configuredAt = undefined;
    this.printedBallots = undefined;
    this.fullElectionExternalTallies = new Map();
    this.castVoteRecordFiles = undefined;
    this.isOfficialResults = undefined;
    this.writeIns = undefined;
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

  protected getWriteInsFromCastVoteRecords(
    castVoteRecordFile: CastVoteRecordFile
  ): Admin.WriteInRecord[] {
    const newWriteIns: Admin.WriteInRecord[] = [];
    for (const cvr of castVoteRecordFile.allCastVoteRecords) {
      for (const [contestId, votes] of castVoteRecordVotes(cvr)) {
        for (const vote of votes) {
          if (castVoteRecordVoteIsWriteIn(vote)) {
            assert(cvr._ballotId);

            newWriteIns.push({
              id: uuid(),
              contestId,
              castVoteRecordId: cvr._ballotId,
              optionId: vote,
              status: 'pending',
            });
          }
        }
      }
    }
    return newWriteIns;
  }

  async addCastVoteRecordFile(
    newCastVoteRecordFile: File
  ): Promise<AddCastVoteRecordFileResult> {
    if (!this.electionDefinition) {
      throw new Error('Election definition must be configured first');
    }

    this.castVoteRecordFiles = await (
      this.castVoteRecordFiles ?? CastVoteRecordFiles.empty
    ).add(newCastVoteRecordFile, this.electionDefinition.election);

    const wasExistingFile = this.castVoteRecordFiles.duplicateFiles.includes(
      newCastVoteRecordFile.name
    );
    const file = this.castVoteRecordFiles.fileList.find(
      (f) => f.name === newCastVoteRecordFile.name
    );
    const newlyAdded = file?.importedCvrCount ?? 0;
    const alreadyPresent = file?.duplicatedCvrCount ?? 0;

    if (!wasExistingFile && file) {
      const newWriteIns = this.getWriteInsFromCastVoteRecords(file);
      this.writeIns = [...(this.writeIns ?? []), ...newWriteIns];
    }

    return {
      wasExistingFile,
      newlyAdded,
      alreadyPresent,
    };
  }

  async clearCastVoteRecordFiles(): Promise<void> {
    await Promise.resolve();
    this.isOfficialResults = undefined;
    this.castVoteRecordFiles = undefined;
    this.writeIns = undefined;
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

  protected filterWriteIns(
    writeIns: readonly Admin.WriteInRecord[],
    options?: {
      contestId?: ContestId;
      status?: Admin.WriteInAdjudicationStatus;
    }
  ): Admin.WriteInRecord[] {
    return writeIns.filter((writeIn) => {
      if (options?.contestId && writeIn.contestId !== options.contestId) {
        return false;
      }
      if (options?.status && writeIn.status !== options.status) {
        return false;
      }
      return true;
    });
  }

  loadWriteIns(options?: {
    contestId?: ContestId;
    status?: Admin.WriteInAdjudicationStatus;
  }): Promise<Admin.WriteInRecord[]> {
    return Promise.resolve(this.filterWriteIns(this.writeIns ?? [], options));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  loadWriteInImage(cvrId: string): Promise<Admin.WriteInImageEntry[]> {
    return Promise.resolve([]);
  }
}
