import * as batcher from '@yornaath/batshit';

import { QueryClient, QueryKey, useQuery } from '@tanstack/react-query';
import { LanguageCode } from '@votingworks/types';
import type { UiStringsApi } from '@votingworks/backend';
import * as grout from '@votingworks/grout';

export type UiStringsApiClient = grout.Client<UiStringsApi>;

function createReactQueryApi(getApiClient: () => UiStringsApiClient) {
  function createBatchAudioClipsClient(languageCode: LanguageCode) {
    return batcher.create({
      fetcher: (queries: Array<{ id: string }>) =>
        getApiClient().getAudioClips({
          audioIds: queries.map((q) => q.id),
          languageCode,
        }),

      resolver: (clips, query) =>
        clips.find((clip) => clip.id === query.id) || null,
    });
  }

  const batchAudioClipsClients = new Map<
    LanguageCode,
    ReturnType<typeof createBatchAudioClipsClient>
  >();

  function getBatchAudioClipsClient(languageCode: LanguageCode) {
    const existingBatchClient = batchAudioClipsClients.get(languageCode);
    if (existingBatchClient) {
      return existingBatchClient;
    }

    const newBatchClient = createBatchAudioClipsClient(languageCode);

    batchAudioClipsClients.set(languageCode, newBatchClient);
    return newBatchClient;
  }

  return {
    getAudioClip: {
      queryKeyPrefix: 'getAudioClip',

      getQueryKey(params: {
        id: string;
        languageCode: LanguageCode;
      }): QueryKey {
        return [this.queryKeyPrefix, params.languageCode, params.id];
      },

      useQuery(params: { id: string; languageCode: LanguageCode }) {
        const batchClient = getBatchAudioClipsClient(params.languageCode);

        return useQuery(this.getQueryKey(params), () =>
          batchClient.fetch({ id: params.id })
        );
      },
    },

    getAvailableLanguages: {
      getQueryKey(): QueryKey {
        return ['getAvailableLanguages'];
      },

      useQuery() {
        const apiClient = getApiClient();

        return useQuery(this.getQueryKey(), () =>
          apiClient.getAvailableLanguages()
        );
      },
    },

    getUiStrings: {
      queryKeyPrefix: 'getUiStrings',

      getQueryKey(languageCode: LanguageCode): QueryKey {
        return [this.queryKeyPrefix, languageCode];
      },

      useQuery(languageCode: LanguageCode) {
        const apiClient = getApiClient();

        return useQuery(this.getQueryKey(languageCode), () =>
          apiClient.getUiStrings({ languageCode })
        );
      },
    },

    getAudioIds: {
      queryKeyPrefix: 'getAudioIds',

      getQueryKey(languageCode: LanguageCode): QueryKey {
        return [this.queryKeyPrefix, languageCode];
      },

      useQuery(languageCode: LanguageCode) {
        const apiClient = getApiClient();

        return useQuery(this.getQueryKey(languageCode), () =>
          apiClient.getUiStringAudioIds({ languageCode })
        );
      },
    },

    async onMachineConfigurationChange(
      queryClient: QueryClient
    ): Promise<void> {
      await queryClient.invalidateQueries(
        this.getAvailableLanguages.getQueryKey()
      );
      await queryClient.invalidateQueries([this.getUiStrings.queryKeyPrefix]);
      await queryClient.invalidateQueries([this.getAudioIds.queryKeyPrefix]);
      await queryClient.invalidateQueries([this.getAudioClip.queryKeyPrefix]);
    },
  };
}

export type UiStringsReactQueryApi = ReturnType<typeof createReactQueryApi>;

export function createUiStringsApi(
  getApiClient: () => UiStringsApiClient
): UiStringsReactQueryApi {
  return createReactQueryApi(getApiClient);
}
