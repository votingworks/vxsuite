import {
  ElectionDefinition,
  Id,
  IdSchema,
  safeParse,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { fetchJson } from '@votingworks/utils';
import { Admin } from '@votingworks/api';
import { ElectionManagerStoreStorageBackend } from './storage_backend';

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
        body: JSON.stringify(parsedElectionDefinition),
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
}
