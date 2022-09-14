import { Admin } from '@votingworks/api';
import { LogEventId, Logger, LoggingUserRole } from '@votingworks/logging';
import {
  ContestId,
  ElectionDefinition,
  ExternalTallySourceType,
  FullElectionExternalTallies,
  FullElectionExternalTally,
  Iso8601TimestampSchema,
  safeParse,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { assert, Storage } from '@votingworks/utils';
import { z } from 'zod';
import { PrintedBallot, PrintedBallotSchema } from '../../config/types';
import { CastVoteRecordFiles } from '../../utils/cast_vote_record_files';
import {
  convertExternalTalliesToStorageString,
  convertStorageStringToExternalTallies,
} from '../../utils/external_tallies';
import { ElectionManagerStoreMemoryBackend } from './memory_backend';
import { AddCastVoteRecordFileResult } from './types';

const electionDefinitionStorageKey = 'electionDefinition';
const cvrsStorageKey = 'cvrFiles';
const isOfficialResultsKey = 'isOfficialResults';
const printedBallotsStorageKey = 'printedBallots';
const configuredAtStorageKey = 'configuredAt';
const externalVoteTalliesFileStorageKey = 'externalVoteTallies';
const writeInsStorageKey = 'writeIns';

export class ElectionManagerStoreStorageBackend extends ElectionManagerStoreMemoryBackend {
  protected readonly storage: Storage;
  protected readonly logger: Logger;
  protected readonly currentUserRole: LoggingUserRole;

  constructor({
    storage,
    logger,
    currentUserRole = 'unknown',
  }: {
    storage: Storage;
    logger: Logger;
    currentUserRole?: LoggingUserRole;
  }) {
    super();
    this.storage = storage;
    this.logger = logger;
    this.currentUserRole = currentUserRole;
  }

  protected async setStorageKeyAndLog(
    storageKey: string,
    value: unknown,
    logDescription: string
  ): Promise<void> {
    try {
      await this.storage.set(storageKey, value);
      await this.logger.log(LogEventId.SaveToStorage, this.currentUserRole, {
        message: `${logDescription} successfully saved to storage.`,
        storageKey,
        disposition: 'success',
      });
    } catch (error) {
      assert(error instanceof Error);
      await this.logger.log(LogEventId.SaveToStorage, this.currentUserRole, {
        message: `Failed to save ${logDescription} to storage.`,
        storageKey,
        error: error.message,
        disposition: 'failure',
      });
    }
  }

  protected async removeStorageKeyAndLog(
    storageKey: string,
    logDescription: string
  ): Promise<void> {
    try {
      await this.storage.remove(storageKey);
      await this.logger.log(LogEventId.SaveToStorage, this.currentUserRole, {
        message: `${logDescription} successfully cleared in storage.`,
        storageKey,
        disposition: 'success',
      });
    } catch (error) {
      assert(error instanceof Error);
      await this.logger.log(LogEventId.SaveToStorage, this.currentUserRole, {
        message: `Failed to clear ${logDescription} in storage.`,
        storageKey,
        error: error.message,
        disposition: 'failure',
      });
    }
  }

  async reset(): Promise<void> {
    try {
      await this.storage.clear();
      await this.logger.log(LogEventId.SaveToStorage, this.currentUserRole, {
        message:
          'All current data in storage, including election definition, cast vote records, tallies, and printed ballot information cleared.',
        disposition: 'success',
      });
    } catch (error) {
      assert(error instanceof Error);
      await this.logger.log(LogEventId.SaveToStorage, this.currentUserRole, {
        message: 'Failed clearing all current data in storage.',
        disposition: 'failure',
        error: error.message,
      });
    }
  }

  async loadElectionDefinitionAndConfiguredAt(): Promise<
    { electionDefinition: ElectionDefinition; configuredAt: string } | undefined
  > {
    const electionDefinition = await this.loadElectionDefinition();
    const configuredAt = await this.loadConfiguredAt();

    if (electionDefinition && configuredAt) {
      return { electionDefinition, configuredAt };
    }
  }

  async configure(newElectionData: string): Promise<ElectionDefinition> {
    await this.reset();

    const newElectionDefinition =
      safeParseElectionDefinition(newElectionData).unsafeUnwrap();
    const newConfiguredAt = new Date().toISOString();

    await this.setStorageKeyAndLog(
      electionDefinitionStorageKey,
      newElectionDefinition,
      'Election Definition'
    );
    await this.setStorageKeyAndLog(
      configuredAtStorageKey,
      newConfiguredAt,
      'Election configured at time'
    );

    return newElectionDefinition;
  }

  async loadCastVoteRecordFiles(): Promise<CastVoteRecordFiles | undefined> {
    const serializedCvrFiles = safeParse(
      z.string().optional(),
      await this.storage.get(cvrsStorageKey)
    ).ok();

    if (serializedCvrFiles) {
      const cvrs = CastVoteRecordFiles.import(serializedCvrFiles);
      await this.logger.log(LogEventId.LoadFromStorage, this.currentUserRole, {
        message:
          'Cast vote records loaded into application from local storage.',
        disposition: 'success',
        numberOfCvrs: cvrs.fileList.length,
      });
      return cvrs;
    }
  }

  async addCastVoteRecordFile(
    newCastVoteRecordFile: File
  ): Promise<AddCastVoteRecordFileResult> {
    const loadElectionResult =
      await this.loadElectionDefinitionAndConfiguredAt();

    if (!loadElectionResult) {
      throw new Error('Cannot add CVR files without an election definition.');
    }

    const loadCastVoteRecordFilesResult =
      (await this.loadCastVoteRecordFiles()) ?? CastVoteRecordFiles.empty;

    const newCastVoteRecordFiles = await loadCastVoteRecordFilesResult.add(
      newCastVoteRecordFile,
      loadElectionResult.electionDefinition.election
    );

    await this.setStorageKeyAndLog(
      cvrsStorageKey,
      newCastVoteRecordFiles.export(),
      'Cast vote records'
    );

    const wasExistingFile = newCastVoteRecordFiles.duplicateFiles.includes(
      newCastVoteRecordFile.name
    );
    const file = newCastVoteRecordFiles.fileList.find(
      (f) => f.name === newCastVoteRecordFile.name
    );
    const newlyAdded = file?.importedCvrCount ?? 0;
    const alreadyPresent = file?.duplicatedCvrCount ?? 0;

    if (!wasExistingFile && file) {
      const newWriteIns = this.getWriteInsFromCastVoteRecords(file);
      await this.setWriteIns([...(await this.loadWriteIns()), ...newWriteIns]);
    }

    return {
      wasExistingFile,
      newlyAdded,
      alreadyPresent,
    };
  }

  async clearCastVoteRecordFiles(): Promise<void> {
    await this.removeStorageKeyAndLog(cvrsStorageKey, 'Cast vote records');
    await this.removeStorageKeyAndLog(
      isOfficialResultsKey,
      'isOfficialResults flag'
    );
  }

  async loadFullElectionExternalTallies(): Promise<
    FullElectionExternalTallies | undefined
  > {
    const serializedExternalTallies = safeParse(
      z.string().optional(),
      await this.storage.get(externalVoteTalliesFileStorageKey)
    ).ok();

    if (serializedExternalTallies) {
      const importedData = convertStorageStringToExternalTallies(
        serializedExternalTallies
      );
      await this.logger.log(LogEventId.LoadFromStorage, 'system', {
        message:
          'External file format vote tally data automatically loaded into application from local storage.',
        disposition: 'success',
        importedTallyFileNames: importedData
          .map((d) => d.inputSourceName)
          .join(', '),
      });
      return new Map(importedData.map((d) => [d.source, d]));
    }
  }

  async updateFullElectionExternalTally(
    sourceType: ExternalTallySourceType,
    newFullElectionExternalTally: FullElectionExternalTally
  ): Promise<void> {
    const newFullElectionExternalTallies = new Map(
      await this.loadFullElectionExternalTallies()
    );
    newFullElectionExternalTallies.set(
      sourceType,
      newFullElectionExternalTally
    );
    await this.setStorageKeyAndLog(
      externalVoteTalliesFileStorageKey,
      convertExternalTalliesToStorageString(newFullElectionExternalTallies),
      `Updated external tally from source: ${newFullElectionExternalTally.source}`
    );
  }

  async removeFullElectionExternalTally(
    sourceType: ExternalTallySourceType
  ): Promise<void> {
    const newFullElectionExternalTallies = new Map(
      await this.loadFullElectionExternalTallies()
    );
    newFullElectionExternalTallies.delete(sourceType);
    await this.setStorageKeyAndLog(
      externalVoteTalliesFileStorageKey,
      convertExternalTalliesToStorageString(newFullElectionExternalTallies),
      `Removed external tally from source: ${sourceType}`
    );
  }

  async clearFullElectionExternalTallies(): Promise<void> {
    await this.removeStorageKeyAndLog(
      externalVoteTalliesFileStorageKey,
      'Cleared all external tallies'
    );
  }

  async loadIsOfficialResults(): Promise<boolean | undefined> {
    const parseResult = safeParse(
      z.boolean(),
      await this.storage.get(isOfficialResultsKey)
    );

    if (parseResult.isErr()) {
      await this.logger.log(LogEventId.LoadFromStorage, this.currentUserRole, {
        message: 'Error parsing official results flag from storage',
        disposition: 'failure',
        storageKey: isOfficialResultsKey,
        error: parseResult.err().message,
      });
      return undefined;
    }

    const isOfficialResults = parseResult.ok();

    await this.logger.log(LogEventId.LoadFromStorage, this.currentUserRole, {
      message:
        'Official results flag loaded into application from local storage.',
      disposition: 'success',
      storageKey: isOfficialResultsKey,
      isOfficialResults,
    });

    return isOfficialResults;
  }
  async markResultsOfficial(): Promise<void> {
    await this.setStorageKeyAndLog(
      isOfficialResultsKey,
      true,
      'isOfficialResults flag'
    );
  }

  async loadPrintedBallots(): Promise<PrintedBallot[] | undefined> {
    const parseResult = safeParse(
      z.array(PrintedBallotSchema),
      await this.storage.get(printedBallotsStorageKey)
    );

    if (parseResult.isErr()) {
      await this.logger.log(LogEventId.LoadFromStorage, this.currentUserRole, {
        message: 'Failed to parse printed ballots from storage',
        disposition: 'failure',
        storageKey: printedBallotsStorageKey,
        error: parseResult.err().message,
      });
      return;
    }

    const printedBallots = parseResult.ok();

    await this.logger.log(LogEventId.LoadFromStorage, this.currentUserRole, {
      message: 'Printed ballots loaded from storage',
      disposition: 'success',
      storageKey: printedBallotsStorageKey,
      totalCount: printedBallots.reduce(
        (count, printedBallot) => count + printedBallot.numCopies,
        0
      ),
    });

    return printedBallots;
  }

  async addPrintedBallot(newPrintedBallot: PrintedBallot): Promise<void> {
    const oldPrintedBallots = await this.loadPrintedBallots();
    const newPrintedBallots = [...(oldPrintedBallots ?? []), newPrintedBallot];
    await this.setStorageKeyAndLog(
      printedBallotsStorageKey,
      newPrintedBallots,
      'Printed ballot information'
    );
  }

  private async loadConfiguredAt(): Promise<string | undefined> {
    const parseResult = safeParse(
      Iso8601TimestampSchema.optional(),
      await this.storage.get(configuredAtStorageKey)
    );

    if (parseResult.isErr()) {
      await this.logger.log(LogEventId.LoadFromStorage, 'system', {
        message: 'Error parsing configuredAt from storage',
        disposition: 'failure',
        storageKey: configuredAtStorageKey,
        error: parseResult.err().message,
      });
      return;
    }

    const configuredAt = parseResult.ok();

    await this.logger.log(LogEventId.LoadFromStorage, 'system', {
      message: 'Configuration timestamp loaded from storage',
      disposition: 'success',
      storageKey: configuredAtStorageKey,
      configuredAt,
    });

    return configuredAt;
  }

  private async loadElectionDefinition(): Promise<
    ElectionDefinition | undefined
  > {
    const loadedElectionDefinition = (await this.storage.get(
      electionDefinitionStorageKey
    )) as ElectionDefinition | undefined;

    if (loadedElectionDefinition) {
      const parseResult = safeParseElectionDefinition(
        loadedElectionDefinition.electionData
      );

      if (parseResult.isErr()) {
        await this.logger.log(LogEventId.LoadFromStorage, 'system', {
          message: 'Error parsing election definition from storage',
          disposition: 'failure',
          storageKey: electionDefinitionStorageKey,
          error: parseResult.err().message,
        });
        return;
      }

      const parsedElectionDefinition = parseResult.ok();

      if (
        parsedElectionDefinition.electionHash !==
        loadedElectionDefinition.electionHash
      ) {
        await this.logger.log(LogEventId.LoadFromStorage, 'system', {
          message: 'Election definition hash mismatch',
          disposition: 'failure',
          storageKey: electionDefinitionStorageKey,
          expectedElectionHash: loadedElectionDefinition.electionHash,
          actualElectionHash: parsedElectionDefinition.electionHash,
        });
        return;
      }

      await this.logger.log(LogEventId.LoadFromStorage, this.currentUserRole, {
        message: 'Election definition loaded from storage',
        disposition: 'success',
        storageKey: electionDefinitionStorageKey,
        electionHash: parsedElectionDefinition.electionHash,
      });

      return parsedElectionDefinition;
    }
  }

  setWriteIns(writeIns?: readonly Admin.WriteInRecord[]): Promise<void> {
    if (writeIns) {
      return this.setStorageKeyAndLog(
        writeInsStorageKey,
        writeIns,
        'Write-in records'
      );
    }
    return this.removeStorageKeyAndLog(writeInsStorageKey, 'Write-in records');
  }

  async loadWriteIns(options?: {
    contestId?: ContestId;
    status?: Admin.WriteInAdjudicationStatus;
  }): Promise<Admin.WriteInRecord[]> {
    const writeIns =
      safeParse(
        z.array(Admin.WriteInsRecordSchema),
        await this.storage.get(writeInsStorageKey)
      ).ok() ?? [];
    return this.filterWriteIns(writeIns, options);
  }
}
