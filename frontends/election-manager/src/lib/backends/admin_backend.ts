import {
  ContestId,
  ContestOptionId,
  ElectionDefinition,
  Id,
  IdSchema,
  safeParse,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { assert, fetchJson, typedAs } from '@votingworks/utils';
import { Admin } from '@votingworks/api';
import { ElectionManagerStoreStorageBackend } from './storage_backend';
import { AddCastVoteRecordFileResult } from './types';

const CVR_FILE_ATTACHMENT_NAME = 'cvrFile';

/** @visibleForTesting */
export const activeElectionIdStorageKey = 'activeElectionId';

export class ElectionManagerStoreAdminBackend extends ElectionManagerStoreStorageBackend {
  private async loadActiveElectionId(): Promise<Id | undefined> {
    return safeParse(
      IdSchema,
      await this.storage.get(activeElectionIdStorageKey)
    ).ok();
  }

  async loadElectionDefinitionAndConfiguredAt(): Promise<
    { electionDefinition: ElectionDefinition; configuredAt: string } | undefined
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
        return {
          electionDefinition: election.electionDefinition,
          configuredAt: election.createdAt,
        };
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
    await super.addCastVoteRecordFile(newCastVoteRecordFile);

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

  async clearCastVoteRecordFiles(): Promise<void> {
    await super.clearCastVoteRecordFiles();

    const activeElectionId = await this.loadActiveElectionId();

    /* istanbul ignore next */
    if (!activeElectionId) {
      throw new Error('no election configured');
    }

    await fetchJson(`/admin/elections/${activeElectionId}/cvr-files`, {
      method: 'DELETE',
    });
  }

  async reset(): Promise<void> {
    const activeElectionId = await this.loadActiveElectionId();

    if (activeElectionId) {
      await this.removeStorageKeyAndLog(
        activeElectionIdStorageKey,
        'active election ID'
      );
    }

    await super.reset();

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

  override async transcribeWriteIn(
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

  override async loadWriteInAdjudications(options?: {
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

  override async updateWriteInAdjudication(
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

  override async deleteWriteInAdjudication(
    writeInAdjudicationId: Id
  ): Promise<void> {
    const response = (await fetchJson(
      `/admin/write-in-adjudications/${writeInAdjudicationId}`,
      {
        method: 'DELETE',
      }
    )) as Admin.DeleteWriteInAdjudicationResponse;

    assert(response.status === 'ok');
  }

  override async getWriteInSummary(options?: {
    contestId?: ContestId;
  }): Promise<Admin.WriteInSummaryEntry[]> {
    const activeElectionId = await this.loadActiveElectionId();

    if (!activeElectionId) {
      throw new Error('no election configured');
    }

    const query = new URLSearchParams();
    if (options?.contestId) {
      query.set('contestId', options.contestId);
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
}
