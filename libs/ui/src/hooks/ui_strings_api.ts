import { QueryClient, QueryKey, useQuery } from '@tanstack/react-query';
import { LanguageCode, UiStringsApi } from '@votingworks/types';
import * as grout from '@votingworks/grout';

// Unable to use `grout.Client<UseStringsApi>` directly due to some mismatched
// type inference with `grout.AnyMethods`, so copying the `grout.Client`
// definition here for now:
export type UiStringsApiClient = {
  [Method in keyof UiStringsApi]: grout.AsyncRpcMethod<UiStringsApi[Method]>;
};

function createReactQueryApi(getApiClient: () => UiStringsApiClient) {
  return {
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

    async onMachineConfigurationChange(
      queryClient: QueryClient
    ): Promise<void> {
      await queryClient.invalidateQueries(
        this.getAvailableLanguages.getQueryKey()
      );
      await queryClient.invalidateQueries([this.getUiStrings.queryKeyPrefix]);
    },

    // TODO(kofi): Fill out.
  };
}

export type UiStringsReactQueryApi = ReturnType<typeof createReactQueryApi>;

export function createUiStringsApi(
  getApiClient: () => UiStringsApiClient
): UiStringsReactQueryApi {
  return createReactQueryApi(getApiClient);
}
