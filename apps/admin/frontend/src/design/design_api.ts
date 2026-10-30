import type { DesignApi } from '@votingworks/admin-backend';
import type { StateCode } from '@votingworks/design-backend';
import {
  type ApiClient,
  listElections,
  useApiClient,
} from '@votingworks/design-ui';
import * as grout from '@votingworks/grout';
import {
  type QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

export type AdminDesignApiClient = grout.Client<DesignApi>;

export function createAdminDesignApiClient(): AdminDesignApiClient {
  return grout.createClient<DesignApi>({ baseUrl: '/design-api' });
}

export function asDesignUiApiClient(client: AdminDesignApiClient): ApiClient {
  return client as unknown as ApiClient;
}

function useAdminDesignApiClient(): AdminDesignApiClient {
  return useApiClient() as unknown as AdminDesignApiClient;
}

export const getLocalJurisdictionId = {
  queryKey(): QueryKey {
    return ['getLocalJurisdictionId'];
  },
  useQuery() {
    const apiClient = useAdminDesignApiClient();
    return useQuery(this.queryKey(), () => apiClient.getLocalJurisdictionId());
  },
} as const;

export const listStateCodes = {
  queryKey(): QueryKey {
    return ['listStateCodes'];
  },
  useQuery() {
    const apiClient = useAdminDesignApiClient();
    return useQuery(this.queryKey(), () => apiClient.listStateCodes());
  },
} as const;

export const getDesignStateCode = {
  queryKey(): QueryKey {
    return ['getDesignStateCode'];
  },
  useQuery() {
    const apiClient = useAdminDesignApiClient();
    return useQuery(this.queryKey(), () => apiClient.getDesignStateCode());
  },
} as const;

export const setDesignStateCode = {
  useMutation() {
    const apiClient = useAdminDesignApiClient();
    const queryClient = useQueryClient();
    return useMutation(
      (input: { stateCode: StateCode }) => apiClient.setDesignStateCode(input),
      {
        async onSuccess() {
          await queryClient.invalidateQueries();
        },
      }
    );
  },
} as const;

export const loadElectionPackage = {
  useMutation() {
    const apiClient = useAdminDesignApiClient();
    const queryClient = useQueryClient();
    return useMutation(
      (input: { electionFilePath: string }) =>
        apiClient.loadElectionPackage(input),
      {
        async onSuccess() {
          await queryClient.invalidateQueries(listElections.queryKey());
        },
      }
    );
  },
} as const;
