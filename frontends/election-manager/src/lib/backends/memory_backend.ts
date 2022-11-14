import { Admin } from '@votingworks/api';
import {
  CandidateContest,
  CastVoteRecord,
  ContestId,
  ContestOptionId,
  ElectionDefinition,
  ExternalTallySourceType,
  FullElectionExternalTallies,
  FullElectionExternalTally,
  Id,
  Iso8601Timestamp,
  Optional,
  safeParseElectionDefinition,
} from '@votingworks/types';
import {
  assert,
  castVoteRecordVoteIsWriteIn,
  castVoteRecordVotes,
  find,
  groupBy,
  typedAs,
} from '@votingworks/utils';
import { v4 as uuid } from 'uuid';
import { CastVoteRecordFile } from '../../config/types';
import { CastVoteRecordFiles } from '../../utils/cast_vote_record_files';
import {
  AddCastVoteRecordFileResult,
  ElectionManagerStoreBackend,
} from './types';

interface MemoryWriteInRecord {
  readonly id: Id;
  readonly castVoteRecordId: Id;
  readonly contestId: ContestId;
  readonly optionId: ContestOptionId;
  readonly transcribedValue?: string;
  readonly adjudicatedValue?: string;
}

/**
 * An in-memory backend for ElectionManagerStore. Useful for tests or an
 * ephemeral session.
 */
export class ElectionManagerStoreMemoryBackend
  implements ElectionManagerStoreBackend
{
  private readonly electionId: Id;
  private electionDefinition?: ElectionDefinition;
  private configuredAt?: Iso8601Timestamp;
  private printedBallots: readonly Admin.PrintedBallotRecord[];
  private fullElectionExternalTallies: Map<
    ExternalTallySourceType,
    FullElectionExternalTally
  >;
  private castVoteRecordFiles?: CastVoteRecordFiles;
  private isOfficialResults?: boolean;
  private writeIns: readonly MemoryWriteInRecord[];
  private writeInAdjudications: readonly Admin.WriteInAdjudicationRecord[];

  constructor({
    electionId = 'memory-election-id',
    electionDefinition,
    configuredAt,
    printedBallots = [],
    fullElectionExternalTallies,
    castVoteRecordFiles,
    isOfficialResults,
    writeInAdjudications = [],
  }: {
    electionId?: Id;
    electionDefinition?: ElectionDefinition;
    configuredAt?: Iso8601Timestamp;
    printedBallots?: readonly Admin.PrintedBallotRecord[];
    fullElectionExternalTallies?: FullElectionExternalTallies;
    castVoteRecordFiles?: CastVoteRecordFiles;
    isOfficialResults?: boolean;
    writeInAdjudications?: readonly Admin.WriteInAdjudicationRecord[];
  } = {}) {
    this.electionId = electionId;
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
    this.writeIns = [];
    this.writeInAdjudications = writeInAdjudications;
  }

  private assertConfigured(): void {
    if (!this.electionDefinition) {
      throw new Error('Election definition must be configured first');
    }
  }

  async reset(): Promise<void> {
    await Promise.resolve();
    this.electionDefinition = undefined;
    this.configuredAt = undefined;
    this.printedBallots = [];
    this.fullElectionExternalTallies = new Map();
    this.castVoteRecordFiles = undefined;
    this.isOfficialResults = undefined;
    this.writeIns = [];
    this.writeInAdjudications = [];
  }

  async loadCurrentElectionMetadata(): Promise<
    Admin.ElectionRecord | undefined
  > {
    await Promise.resolve();
    if (this.electionDefinition && this.configuredAt) {
      return {
        id: 'memory-current-election',
        electionDefinition: this.electionDefinition,
        createdAt: this.configuredAt,
        isOfficialResults: this.isOfficialResults ?? false,
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

  getCurrentCvrFileMode(): Promise<Admin.CvrFileMode> {
    const sampleCvr = this.castVoteRecordFiles?.castVoteRecords?.next()
      ?.value as Optional<CastVoteRecord>;
    if (!sampleCvr) {
      return Promise.resolve(Admin.CvrFileMode.Unlocked);
    }

    return Promise.resolve(
      sampleCvr._testBallot
        ? Admin.CvrFileMode.Test
        : Admin.CvrFileMode.Official
    );
  }

  loadCastVoteRecordFiles(): Promise<CastVoteRecordFiles | undefined> {
    return Promise.resolve(this.castVoteRecordFiles);
  }

  getWriteInsFromCastVoteRecords(
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
    newCastVoteRecordFile: File,
    options?: { analyzeOnly?: boolean }
  ): Promise<AddCastVoteRecordFileResult> {
    if (!this.electionDefinition) {
      throw new Error('Election definition must be configured first');
    }

    const oldCastVoteRecordFiles = this.castVoteRecordFiles;

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

    if (!wasExistingFile && file && !options?.analyzeOnly) {
      const newWriteIns = this.getWriteInsFromCastVoteRecords(file);
      this.writeIns = [...(this.writeIns ?? []), ...newWriteIns];
    }

    if (options?.analyzeOnly) {
      this.castVoteRecordFiles = oldCastVoteRecordFiles;
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
    this.writeIns = [];
    this.writeInAdjudications = [];
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

  async markResultsOfficial(): Promise<void> {
    await Promise.resolve();
    this.isOfficialResults = true;
  }

  async loadPrintedBallots({
    ballotMode,
  }: { ballotMode?: Admin.BallotMode } = {}): Promise<
    Admin.PrintedBallotRecord[]
  > {
    await Promise.resolve();
    this.assertConfigured();
    return this.printedBallots.filter(
      (printedBallot) => !ballotMode || printedBallot.ballotMode === ballotMode
    );
  }

  async addPrintedBallot(printedBallot: Admin.PrintedBallot): Promise<Id> {
    await Promise.resolve();
    const printedBallotRecord: Admin.PrintedBallotRecord = {
      ...printedBallot,
      id: uuid(),
      electionId: this.electionId,
      createdAt: new Date().toISOString(),
    };
    this.printedBallots = [...this.printedBallots, printedBallotRecord];
    return printedBallotRecord.id;
  }

  filterWriteIns(
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
    const { writeInAdjudications } = this;
    return Promise.resolve(
      this.filterWriteIns(
        this.writeIns.map((writeIn) => {
          if (!writeIn.transcribedValue) {
            return {
              id: writeIn.id,
              castVoteRecordId: writeIn.castVoteRecordId,
              contestId: writeIn.contestId,
              optionId: writeIn.optionId,
              status: 'pending',
            };
          }

          const adjudication = writeInAdjudications.find(
            (a) =>
              a.contestId === writeIn.contestId &&
              a.transcribedValue === writeIn.transcribedValue
          );

          if (!adjudication) {
            return typedAs<Admin.WriteInRecordTranscribed>({
              id: writeIn.id,
              castVoteRecordId: writeIn.castVoteRecordId,
              contestId: writeIn.contestId,
              optionId: writeIn.optionId,
              status: 'transcribed',
              transcribedValue: writeIn.transcribedValue,
            });
          }

          return typedAs<Admin.WriteInRecordAdjudicated>({
            id: writeIn.id,
            castVoteRecordId: writeIn.castVoteRecordId,
            contestId: writeIn.contestId,
            optionId: writeIn.optionId,
            status: 'adjudicated',
            transcribedValue: writeIn.transcribedValue,
            adjudicatedValue: adjudication.adjudicatedValue,
            adjudicatedOptionId: adjudication.adjudicatedOptionId,
          });
        }),
        options
      )
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  loadWriteInImage(cvrId: string): Promise<Admin.WriteInImageEntry[]> {
    return Promise.resolve([]);
  }

  async transcribeWriteIn(
    writeInId: Id,
    transcribedValue: string
  ): Promise<void> {
    await Promise.resolve();

    const { writeIns = [] } = this;

    const writeInIndex = writeIns.findIndex((w) => w.id === writeInId);
    if (writeInIndex < 0) {
      throw new Error(`Write-in not found: ${writeInId}`);
    }

    this.writeIns = [
      ...writeIns.slice(0, writeInIndex),
      {
        ...writeIns[writeInIndex],
        transcribedValue,
      },
      ...writeIns.slice(writeInIndex + 1),
    ];
  }

  async loadWriteInAdjudications(options?: {
    contestId?: ContestId;
  }): Promise<Admin.WriteInAdjudicationRecord[]> {
    await Promise.resolve();
    return (
      this.writeInAdjudications.filter(
        (writeInAdjudication) =>
          !options?.contestId ||
          writeInAdjudication.contestId === options.contestId
      ) ?? []
    );
  }

  async adjudicateWriteInTranscription(
    contestId: ContestId,
    transcribedValue: string,
    adjudicatedValue: string,
    adjudicatedOptionId?: ContestOptionId
  ): Promise<Id> {
    await Promise.resolve();

    const id = uuid();

    this.writeInAdjudications = [
      ...(this.writeInAdjudications ?? []),
      {
        id,
        contestId,
        transcribedValue,
        adjudicatedValue,
        adjudicatedOptionId,
      },
    ];

    return id;
  }

  async updateWriteInAdjudication(
    writeInAdjudicationId: Id,
    adjudicatedValue: string,
    adjudicatedOptionId?: ContestOptionId
  ): Promise<void> {
    await Promise.resolve();

    const { writeInAdjudications } = this;
    const writeInAdjudicationIndex = writeInAdjudications.findIndex(
      ({ id }) => id === writeInAdjudicationId
    );

    if (writeInAdjudicationIndex < 0) {
      throw new Error(
        `Write-in adjudication not found: ${writeInAdjudicationId}`
      );
    }

    this.writeInAdjudications = [
      ...writeInAdjudications.slice(0, writeInAdjudicationIndex),
      {
        ...writeInAdjudications[writeInAdjudicationIndex],
        adjudicatedValue,
        adjudicatedOptionId,
      },
      ...writeInAdjudications.slice(writeInAdjudicationIndex + 1),
    ];
  }

  async deleteWriteInAdjudication(writeInAdjudicationId: Id): Promise<void> {
    await Promise.resolve();

    const { writeInAdjudications } = this;
    const writeInAdjudicationIndex = writeInAdjudications.findIndex(
      ({ id }) => id === writeInAdjudicationId
    );

    if (writeInAdjudicationIndex < 0) {
      throw new Error(
        `Write-in adjudication not found: ${writeInAdjudicationId}`
      );
    }

    this.writeInAdjudications = [
      ...writeInAdjudications.slice(0, writeInAdjudicationIndex),
      ...writeInAdjudications.slice(writeInAdjudicationIndex + 1),
    ];
  }

  async getWriteInSummary({
    contestId,
    status,
  }: {
    contestId?: ContestId;
    status?: Admin.WriteInAdjudicationStatus;
  } = {}): Promise<Admin.WriteInSummaryEntry[]> {
    const writeInAdjudications = await this.loadWriteInAdjudications({
      contestId,
    });

    return Array.from(
      groupBy(this.writeIns ?? [], (writeIn) => writeIn.contestId)
    )
      .flatMap(([writeInContestId, writeInsByContest]) =>
        !contestId || contestId === writeInContestId
          ? Array.from(
              groupBy(writeInsByContest, (writeIn) => writeIn.transcribedValue),
              ([
                transcribedValue,
                writeInsByContestAndTranscribedValue,
              ]): Admin.WriteInSummaryEntry => {
                const writeInAdjudication = writeInAdjudications.find(
                  (adjudication) =>
                    adjudication.transcribedValue === transcribedValue
                );

                if (writeInAdjudication && transcribedValue) {
                  return {
                    status: 'adjudicated',
                    contestId: writeInContestId,
                    transcribedValue,
                    writeInCount: writeInsByContestAndTranscribedValue.size,
                    writeInAdjudication,
                  };
                }

                if (transcribedValue) {
                  return {
                    status: 'transcribed',
                    contestId: writeInContestId,
                    transcribedValue,
                    writeInCount: writeInsByContestAndTranscribedValue.size,
                  };
                }

                return {
                  status: 'pending',
                  contestId: writeInContestId,
                  writeInCount: writeInsByContestAndTranscribedValue.size,
                };
              }
            )
          : []
      )
      .filter((entry) => !status || entry.status === status);
  }

  async getWriteInAdjudicationTable(
    contestId: ContestId
  ): Promise<Admin.WriteInAdjudicationTable> {
    const contest = find(
      this.electionDefinition?.election.contests ?? [],
      (c): c is CandidateContest => c.id === contestId && c.type === 'candidate'
    );
    const summaries = (await this.getWriteInSummary({ contestId })).filter(
      (summary): summary is Admin.WriteInSummaryEntryNonPending =>
        summary.status !== 'pending'
    );
    return Admin.Views.writeInAdjudicationTable.render(contest, summaries);
  }
}
