import {
  ContestId,
  ContestOptionId,
  ElectionDefinition,
  ExternalTallySourceType,
  FullElectionExternalTallies,
  FullElectionExternalTally,
  Id,
  IdSchema,
  safeParse,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { assert, fetchJson, Storage, typedAs } from '@votingworks/utils';
import { Admin } from '@votingworks/api';
import { LogEventId, Logger, LoggingUserRole } from '@votingworks/logging';
import { z } from 'zod';
import {
  AddCastVoteRecordFileResult,
  ElectionManagerStoreBackend,
} from './types';
import { PrintedBallot, PrintedBallotSchema } from '../../config/types';
import { CastVoteRecordFiles } from '../../utils/cast_vote_record_files';
import {
  convertExternalTalliesToStorageString,
  convertStorageStringToExternalTallies,
} from '../../utils/external_tallies';

const CVR_FILE_ATTACHMENT_NAME = 'cvrFile';
const cvrsStorageKey = 'cvrFiles';
const isOfficialResultsKey = 'isOfficialResults';
const printedBallotsStorageKey = 'printedBallots';
const externalVoteTalliesFileStorageKey = 'externalVoteTallies';

/** @visibleForTesting */
export const activeElectionIdStorageKey = 'activeElectionId';

/**
 * Backend for storing election data.
 *
 * Note that some of this is still using local storage, but that will be
 * replaced with the `admin` service.
 */
export class ElectionManagerStoreAdminBackend
  implements ElectionManagerStoreBackend
{
  private readonly storage: Storage;
  private readonly logger: Logger;
  private readonly currentUserRole: LoggingUserRole;

  constructor({
    storage,
    logger,
    currentUserRole,
  }: {
    storage: Storage;
    logger: Logger;
    currentUserRole?: LoggingUserRole;
  }) {
    this.storage = storage;
    this.logger = logger;
    this.currentUserRole = currentUserRole ?? 'unknown';
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

  private async loadActiveElectionId(): Promise<Id | undefined> {
    return safeParse(
      IdSchema,
      await this.storage.get(activeElectionIdStorageKey)
    ).ok();
  }

  async loadCurrentElectionMetadata(): Promise<
    Admin.ElectionRecord | undefined
  > {
    const activeElectionId = await this.loadActiveElectionId();

    if (!activeElectionId) {
      return undefined;
    }

    const parseResult = safeParse(
      Admin.GetElectionsResponseSchema,
      await fetchJson('/admin/elections')
    );

    if (parseResult.isErr()) {
      throw parseResult.err();
    }

    for (const election of parseResult.ok()) {
      if (election.id === activeElectionId) {
        return election;
      }
    }
  }

  async configure(newElectionData: string): Promise<ElectionDefinition> {
    const parseResult = safeParseElectionDefinition(newElectionData);

    if (parseResult.isErr()) {
      throw parseResult.err();
    }

    await this.reset();

    const parsedElectionDefinition = parseResult.ok();

    const parseResponseResult = safeParse(
      Admin.PostElectionResponseSchema,
      await fetchJson('/admin/elections', {
        method: 'POST',
        body: JSON.stringify(
          typedAs<Admin.PostElectionRequest>(parsedElectionDefinition)
        ),
        headers: {
          'Content-Type': 'application/json',
        },
      })
    );

    if (parseResponseResult.isErr()) {
      throw parseResponseResult.err();
    }

    const parsedResponse = parseResponseResult.ok();

    if (parsedResponse.status !== 'ok') {
      throw new Error(
        `could not create election: ${parsedResponse.errors
          .map((e) => e.message)
          .join(', ')}`
      );
    }

    await this.storage.set(activeElectionIdStorageKey, parsedResponse.id);

    return parsedElectionDefinition;
  }

  async addCastVoteRecordFile(
    newCastVoteRecordFile: File
  ): Promise<AddCastVoteRecordFileResult> {
    await this.addCastVoteRecordFileToStorage(newCastVoteRecordFile);

    const activeElectionId = await this.loadActiveElectionId();

    /* istanbul ignore next */
    if (!activeElectionId) {
      throw new Error('no election configured');
    }

    const formData = new FormData();
    formData.append(CVR_FILE_ATTACHMENT_NAME, newCastVoteRecordFile);

    const addCastVoteRecordFileResponse = (await fetchJson(
      `/admin/elections/${activeElectionId}/cvr-files`,
      {
        method: 'POST',
        body: formData,
      }
    )) as Admin.PostCvrFileResponse;

    if (addCastVoteRecordFileResponse.status !== 'ok') {
      throw new Error(
        `could not add cast vote record file: ${addCastVoteRecordFileResponse.errors
          .map((e) => e.message)
          .join(', ')}`
      );
    }

    return {
      wasExistingFile: addCastVoteRecordFileResponse.wasExistingFile,
      newlyAdded: addCastVoteRecordFileResponse.newlyAdded,
      alreadyPresent: addCastVoteRecordFileResponse.alreadyPresent,
    };
  }

  private async addCastVoteRecordFileToStorage(
    newCastVoteRecordFile: File
  ): Promise<void> {
    const loadElectionResult = await this.loadCurrentElectionMetadata();

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
  }

  async clearCastVoteRecordFiles(): Promise<void> {
    await this.clearCastVoteRecordFilesFromStorage();

    const activeElectionId = await this.loadActiveElectionId();

    /* istanbul ignore next */
    if (!activeElectionId) {
      throw new Error('no election configured');
    }

    await fetchJson(`/admin/elections/${activeElectionId}/cvr-files`, {
      method: 'DELETE',
    });
  }

  private async clearCastVoteRecordFilesFromStorage(): Promise<void> {
    await this.removeStorageKeyAndLog(cvrsStorageKey, 'Cast vote records');
    await this.removeStorageKeyAndLog(
      isOfficialResultsKey,
      'isOfficialResults flag'
    );
  }

  async markResultsOfficial(): Promise<void> {
    const activeElectionId = await this.loadActiveElectionId();

    /* istanbul ignore next */
    if (!activeElectionId) {
      throw new Error('no election configured');
    }

    await fetchJson(`/admin/elections/${activeElectionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        typedAs<Admin.PatchElectionRequest>({ isOfficialResults: true })
      ),
    });

    await this.logger.log(
      LogEventId.MarkedTallyResultsOfficial,
      this.currentUserRole,
      {
        message:
          'User has marked the tally results as official, no more Cvr files can be loaded.',
        disposition: 'success',
      }
    );
  }

  async reset(): Promise<void> {
    const activeElectionId = await this.loadActiveElectionId();

    await this.storage.clear();

    if (activeElectionId) {
      await fetchJson(`/admin/elections/${activeElectionId}`, {
        method: 'DELETE',
      });
    }
  }

  async loadWriteIns(options?: {
    contestId?: ContestId;
    status?: Admin.WriteInAdjudicationStatus;
  }): Promise<Admin.WriteInRecord[]> {
    const activeElectionId = await this.loadActiveElectionId();

    /* istanbul ignore next */
    if (!activeElectionId) {
      throw new Error('no election configured');
    }

    const query = new URLSearchParams();
    if (options?.contestId) {
      query.set('contestId', options.contestId);
    }
    if (options?.status) {
      query.set('status', options.status);
    }

    const response = (await fetchJson(
      `/admin/elections/${activeElectionId}/write-ins?${query}`
    )) as Admin.GetWriteInsResponse;

    if (!Array.isArray(response)) {
      throw new Error(response.errors.map((e) => e.message).join(', '));
    }

    return response;
  }

  async loadWriteInImage(
    writeInId: string
  ): Promise<Admin.WriteInImageEntry[]> {
    const response = (await fetchJson(
      `/admin/write-in-image/${writeInId}`
    )) as Admin.GetWriteInImageResponse;

    if (!Array.isArray(response)) {
      throw new Error(response.errors.map((e) => e.message).join(', '));
    }

    return response;
  }

  async transcribeWriteIn(
    writeInId: Id,
    transcribedValue: string
  ): Promise<void> {
    const response = (await fetchJson(
      `/admin/write-ins/${writeInId}/transcription`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          typedAs<Admin.PutWriteInTranscriptionRequest>({
            value: transcribedValue,
          })
        ),
      }
    )) as Admin.PutWriteInTranscriptionResponse;

    if (response.status !== 'ok') {
      throw new Error(response.errors.map((e) => e.message).join(', '));
    }
  }

  async loadWriteInAdjudications(options?: {
    contestId?: ContestId;
  }): Promise<Admin.WriteInAdjudicationRecord[]> {
    const activeElectionId = await this.loadActiveElectionId();

    /* istanbul ignore next */
    if (!activeElectionId) {
      throw new Error('no election configured');
    }

    const query = new URLSearchParams();
    if (options?.contestId) {
      query.set('contestId', options.contestId);
    }

    const response = (await fetchJson(
      `/admin/elections/${activeElectionId}/write-in-adjudications?${query}`
    )) as Admin.GetWriteInAdjudicationsResponse;

    if (!Array.isArray(response)) {
      throw new Error(response.errors.map((e) => e.message).join(', '));
    }

    return response;
  }

  async adjudicateWriteInTranscription(
    contestId: ContestId,
    transcribedValue: string,
    adjudicatedValue: string,
    adjudicatedOptionId?: ContestOptionId
  ): Promise<Id> {
    const activeElectionId = await this.loadActiveElectionId();

    /* istanbul ignore next */
    if (!activeElectionId) {
      throw new Error('no election configured');
    }

    const response = (await fetchJson(
      `/admin/elections/${activeElectionId}/write-in-adjudications`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          typedAs<Admin.PostWriteInAdjudicationRequest>({
            contestId,
            transcribedValue,
            adjudicatedValue,
            adjudicatedOptionId,
          })
        ),
      }
    )) as Admin.PostWriteInAdjudicationResponse;

    if (response.status !== 'ok') {
      throw new Error(response.errors.map((e) => e.message).join(', '));
    }

    return response.id;
  }

  async updateWriteInAdjudication(
    writeInAdjudicationId: Id,
    adjudicatedValue: string,
    adjudicatedOptionId?: ContestOptionId
  ): Promise<void> {
    const response = (await fetchJson(
      `/admin/write-in-adjudications/${writeInAdjudicationId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          typedAs<Admin.PutWriteInAdjudicationRequest>({
            adjudicatedValue,
            adjudicatedOptionId,
          })
        ),
      }
    )) as Admin.PutWriteInAdjudicationResponse;

    if (response.status !== 'ok') {
      throw new Error(response.errors.map((e) => e.message).join(', '));
    }
  }

  async deleteWriteInAdjudication(writeInAdjudicationId: Id): Promise<void> {
    const response = (await fetchJson(
      `/admin/write-in-adjudications/${writeInAdjudicationId}`,
      {
        method: 'DELETE',
      }
    )) as Admin.DeleteWriteInAdjudicationResponse;

    assert(response.status === 'ok');
  }

  async getWriteInSummary(options?: {
    contestId?: ContestId;
    status?: Admin.WriteInAdjudicationStatus;
  }): Promise<Admin.WriteInSummaryEntry[]> {
    const activeElectionId = await this.loadActiveElectionId();

    if (!activeElectionId) {
      throw new Error('no election configured');
    }

    const query = new URLSearchParams();
    if (options?.contestId) {
      query.set('contestId', options.contestId);
    }

    if (options?.status) {
      query.set('status', options.status);
    }

    const response = (await fetchJson(
      `/admin/elections/${activeElectionId}/write-in-summary?${query}`
    )) as Admin.GetWriteInSummaryResponse;

    if (!Array.isArray(response)) {
      throw new Error(response.errors.map((e) => e.message).join(', '));
    }

    return response;
  }

  async getWriteInAdjudicationTable(
    contestId: string
  ): Promise<Admin.WriteInAdjudicationTable> {
    const activeElectionId = await this.loadActiveElectionId();

    if (!activeElectionId) {
      throw new Error('no election configured');
    }

    const response = (await fetchJson(
      `/admin/elections/${activeElectionId}/contests/${contestId}/write-in-adjudication-table`
    )) as Admin.GetWriteInAdjudicationTableResponse;

    if (response.status === 'error') {
      throw new Error(response.errors.map((e) => e.message).join(', '));
    }

    return response.table;
  }

  private async setStorageKeyAndLog(
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

  private async removeStorageKeyAndLog(
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
}
