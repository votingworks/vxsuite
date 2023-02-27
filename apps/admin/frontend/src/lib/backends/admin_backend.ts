import { Admin, fetchWithSchema } from '@votingworks/api';
import { assert, typedAs } from '@votingworks/basics';
import { LogEventId, Logger, LoggingUserRole } from '@votingworks/logging';
import {
  CastVoteRecord,
  ContestId,
  ContestOptionId,
  ElectionDefinition,
  ExternalTallySourceType,
  FullElectionExternalTallies,
  FullElectionExternalTally,
  Id,
  safeParse,
  safeParseElectionDefinition,
} from '@votingworks/types';
import {
  fetchJson,
  parseCvrFileInfoFromFilename,
  Storage,
} from '@votingworks/utils';
import { z } from 'zod';
import {
  convertExternalTalliesToStorageString,
  convertStorageStringToExternalTallies,
} from '../../utils/external_tallies';
import { ElectionManagerStoreBackend } from './types';

const CVR_FILE_ATTACHMENT_NAME = 'cvrFile';
const CVR_FILE_TIMESTAMP_FIELD_NAME = 'exportedTimestamp';
const externalVoteTalliesFileStorageKey = 'externalVoteTallies';

/** @visibleForTesting */
export const currentElectionIdStorageKey = 'currentElectionId';

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

  async loadPrintedBallots({
    ballotMode,
  }: { ballotMode?: Admin.BallotMode } = {}): Promise<
    Admin.PrintedBallotRecord[]
  > {
    const searchParams = new URLSearchParams();
    if (ballotMode) {
      searchParams.set('ballotMode', ballotMode);
    }
    const response = await fetchJson(
      `/admin/elections/printed-ballots?${searchParams}`
    );

    const parseResult = safeParse(
      Admin.GetPrintedBallotsResponseSchema,
      response
    );

    /* istanbul ignore next */
    if (parseResult.isErr()) {
      throw parseResult.err();
    }

    const body = parseResult.ok();

    if (body.status === 'error') {
      throw new Error(body.errors.map((e) => e.message).join(', '));
    }

    return body.printedBallots;
  }

  async addPrintedBallot(newPrintedBallot: Admin.PrintedBallot): Promise<Id> {
    const response = await fetchJson(`/admin/elections/printed-ballots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newPrintedBallot),
    });

    const parseResult = safeParse(
      Admin.PostPrintedBallotResponseSchema,
      response
    );

    /* istanbul ignore next */
    if (parseResult.isErr()) {
      throw parseResult.err();
    }

    const body = parseResult.ok();

    if (body.status === 'error') {
      throw new Error(body.errors.map((e) => e.message).join(', '));
    }

    return body.id;
  }

  async loadCurrentElectionMetadata(): Promise<
    Admin.ElectionRecord | undefined
  > {
    const parseResult = safeParse(
      Admin.GetCurrentElectionResponseSchema,
      await fetchJson('/admin/elections/current')
    );

    /* istanbul ignore next */
    if (parseResult.isErr()) {
      throw parseResult.err();
    }

    return parseResult.ok().electionRecord;
  }

  async configure(newElectionData: string): Promise<ElectionDefinition> {
    const parseResult = safeParseElectionDefinition(newElectionData);

    /* istanbul ignore next */
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

    return parsedElectionDefinition;
  }

  async getCurrentCvrFileMode(): Promise<Admin.CvrFileMode> {
    const response = (await fetchJson(
      `/admin/elections/cvr-file-mode`
    )) as Admin.GetCvrFileModeResponse;

    if (response.status !== 'ok') {
      throw new Error(
        `Unable to determine the current CVR file import mode: ${response.errors
          .map((e) => e.message)
          .join(', ')}`
      );
    }

    return response.cvrFileMode;
  }

  async getCvrFiles(): Promise<Admin.CastVoteRecordFileRecord[]> {
    return (await fetchJson(
      `/admin/elections/cvr-files`
    )) as Admin.CastVoteRecordFileRecord[];
  }

  async getCvrs(): Promise<CastVoteRecord[]> {
    return (await fetchJson(`/admin/elections/cvrs`)) as CastVoteRecord[];
  }

  async addCastVoteRecordFile(
    newCastVoteRecordFile: File,
    options?: { analyzeOnly?: boolean }
  ): Promise<Admin.CvrFileImportInfo> {
    const infoFromFilename = parseCvrFileInfoFromFilename(
      newCastVoteRecordFile.name
    );
    const cvrFileExportTimestamp = new Date(
      infoFromFilename?.timestamp || newCastVoteRecordFile.lastModified
    );

    const formData = new FormData();
    formData.append(CVR_FILE_ATTACHMENT_NAME, newCastVoteRecordFile);
    formData.append(
      CVR_FILE_TIMESTAMP_FIELD_NAME,
      cvrFileExportTimestamp.toISOString()
    );

    const query = new URLSearchParams();
    if (options?.analyzeOnly) {
      query.set('analyzeOnly', options.analyzeOnly.toString());
    }

    const addCastVoteRecordFileResponse = await fetchWithSchema(
      Admin.PostCvrFileResponseSchema,
      `/admin/elections/cvr-files?${query}`,
      { method: 'POST', body: formData }
    );

    if (addCastVoteRecordFileResponse.status !== 'ok') {
      throw new Error(
        `could not add cast vote record file: ${addCastVoteRecordFileResponse.errors
          .map((e) => e.message)
          .join(', ')}`
      );
    }

    const {
      alreadyPresent,
      exportedTimestamp,
      fileMode,
      fileName,
      id,
      newlyAdded,
      scannerIds,
      wasExistingFile,
    } = addCastVoteRecordFileResponse;

    return {
      alreadyPresent,
      exportedTimestamp,
      fileMode,
      fileName,
      id,
      newlyAdded,
      scannerIds,
      wasExistingFile,
    };
  }

  async clearCastVoteRecordFiles(): Promise<void> {
    await fetchJson(`/admin/elections/cvr-files`, {
      method: 'DELETE',
    });
  }

  async reset(): Promise<void> {
    await this.storage.clear();

    await fetchJson(`/admin/elections/current`, {
      method: 'DELETE',
    });
  }

  async loadWriteIns(options?: {
    contestId?: ContestId;
    status?: Admin.WriteInAdjudicationStatus;
  }): Promise<Admin.WriteInRecord[]> {
    const query = new URLSearchParams();
    if (options?.contestId) {
      query.set('contestId', options.contestId);
    }
    if (options?.status) {
      query.set('status', options.status);
    }

    const response = (await fetchJson(
      `/admin/elections/write-ins?${query}`
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
    const query = new URLSearchParams();
    if (options?.contestId) {
      query.set('contestId', options.contestId);
    }

    const response = (await fetchJson(
      `/admin/elections/write-in-adjudications?${query}`
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
    const response = (await fetchJson(
      `/admin/elections/write-in-adjudications`,
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
    const query = new URLSearchParams();
    if (options?.contestId) {
      query.set('contestId', options.contestId);
    }

    if (options?.status) {
      query.set('status', options.status);
    }

    const response = (await fetchJson(
      `/admin/elections/write-in-summary?${query}`
    )) as Admin.GetWriteInSummaryResponse;

    if (!Array.isArray(response)) {
      throw new Error(response.errors.map((e) => e.message).join(', '));
    }

    return response;
  }

  async getWriteInAdjudicationTable(
    contestId: ContestId
  ): Promise<Admin.WriteInAdjudicationTable> {
    const response = (await fetchJson(
      `/admin/elections/contests/${contestId}/write-in-adjudication-table`
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
