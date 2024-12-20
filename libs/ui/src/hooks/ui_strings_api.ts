import * as batcher from '@yornaath/batshit';

import {
  QueryClient,
  QueryKey,
  useQueries,
  useQuery,
} from '@tanstack/react-query';
import type { UiStringsApi } from '@votingworks/backend';
import * as grout from '@votingworks/grout';
import { assertDefined } from '@votingworks/basics';

export type UiStringsApiClient = grout.Client<UiStringsApi>;

function createReactQueryApi(getApiClient: () => UiStringsApiClient) {
  function createBatchAudioClipsClient(params: {
    apiClient: UiStringsApiClient;
    languageCode: string;
  }) {
    const { apiClient, languageCode } = params;

    return batcher.create({
      fetcher: (queries: Array<{ id: string }>) =>
        apiClient.getAudioClips({
          audioIds: queries.map((q) => q.id),
          languageCode,
        }),

      resolver: (clips, query) =>
        clips.find((clip) => clip.id === query.id) || null,
    });
  }

  const batchAudioClipsClients = new Map<
    string,
    ReturnType<typeof createBatchAudioClipsClient>
  >();

  function getBatchAudioClipsClient(params: {
    apiClient: UiStringsApiClient;
    languageCode: string;
  }) {
    const { languageCode } = params;
    const existingBatchClient = batchAudioClipsClients.get(languageCode);
    if (existingBatchClient) {
      return existingBatchClient;
    }

    const newBatchClient = createBatchAudioClipsClient(params);

    batchAudioClipsClients.set(languageCode, newBatchClient);
    return newBatchClient;
  }

  return {
    getAudioClip: {
      queryKeyPrefix: 'getAudioClip',

      getQueryKey(params: { id: string; languageCode: string }): QueryKey {
        return [this.queryKeyPrefix, params.languageCode, params.id];
      },

      useQuery(params: { id: string; languageCode: string }) {
        const batchClient = getBatchAudioClipsClient({
          apiClient: getApiClient(),
          languageCode: params.languageCode,
        });

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

      getQueryKey(languageCode: string): QueryKey {
        return [this.queryKeyPrefix, languageCode];
      },

      useQuery(languageCode: string) {
        const apiClient = getApiClient();

        return useQuery(this.getQueryKey(languageCode), () =>
          apiClient.getUiStrings({ languageCode })
        );
      },
    },

    getAudioIds: {
      queryKeyPrefix: 'getAudioIds',

      getQueryKey(languageCode: string): QueryKey {
        return [this.queryKeyPrefix, languageCode];
      },

      useQueries(languageCodes: string[]) {
        const apiClient = getApiClient();

        const queries = useQueries({
          queries: languageCodes.map((languageCode) => ({
            queryKey: this.getQueryKey(languageCode),
            queryFn: () => apiClient.getUiStringAudioIds({ languageCode }),
          })),
        });

        const indexedQueries: { [key: string]: (typeof queries)[number] } = {};
        for (let i = 0; i < languageCodes.length; i += 1) {
          const languageCode = languageCodes[i];
          indexedQueries[languageCode] = queries[i];
        }

        return indexedQueries;
      },

      useQuery(languageCode: string) {
        const queries = this.useQueries([languageCode]);
        return assertDefined(queries[languageCode]);
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
