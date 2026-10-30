import type { DesignApi } from '@votingworks/admin-backend';
import type { StateCode } from '@votingworks/design-backend';
import React from 'react';
import {
  type ApiClient,
  getBallotsFinalizedAt,
  listElections,
  useApiClient,
} from '@votingworks/design-ui';
import type { ElectionId } from '@votingworks/types';
import * as grout from '@votingworks/grout';
import {
  type QueryClient,
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

export const AdminQueryClientContext = React.createContext<
  QueryClient | undefined
>(undefined);

const EXPORT_POLLING_INTERVAL_MS = 1000;

export const getElectionPackage = {
  queryKey(electionId: ElectionId): QueryKey {
    return ['getElectionPackage', electionId];
  },
  useQuery(electionId: ElectionId) {
    const apiClient = useAdminDesignApiClient();
    return useQuery(
      this.queryKey(electionId),
      () => apiClient.getElectionPackage({ electionId }),
      {
        refetchInterval: (data) =>
          data?.task && !data.task.completedAt
            ? EXPORT_POLLING_INTERVAL_MS
            : false,
      }
    );
  },
} as const;

export const finalizeAndExportBallots = {
  useMutation() {
    const apiClient = useAdminDesignApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.finalizeAndExportBallots, {
      async onSuccess(_, { electionId }) {
        await queryClient.invalidateQueries(
          getBallotsFinalizedAt.queryKey(electionId)
        );
        await queryClient.invalidateQueries(
          getElectionPackage.queryKey(electionId)
        );
        await queryClient.invalidateQueries(listElections.queryKey());
      },
    });
  },
} as const;

export const unfinalizeBallots = {
  useMutation() {
    const apiClient = useAdminDesignApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.unfinalizeBallots, {
      async onSuccess(_, { electionId }) {
        await queryClient.invalidateQueries(
          getBallotsFinalizedAt.queryKey(electionId)
        );
        await queryClient.invalidateQueries(listElections.queryKey());
      },
    });
  },
} as const;

export const saveDesignExportToUsb = {
  useMutation() {
    const apiClient = useAdminDesignApiClient();
    return useMutation(apiClient.saveDesignExportToUsb);
  },
} as const;

export const configureFromDesign = {
  useMutation() {
    const apiClient = useAdminDesignApiClient();
    const adminQueryClient = React.useContext(AdminQueryClientContext);
    return useMutation(apiClient.configureFromDesign, {
      async onSuccess(result) {
        if (result.isOk()) {
          await adminQueryClient?.invalidateQueries();
        }
      },
    });
  },
} as const;

export const duplicateElection = {
  useMutation() {
    const apiClient = useAdminDesignApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.duplicateElection, {
      async onSuccess() {
        await queryClient.invalidateQueries(listElections.queryKey());
      },
    });
  },
} as const;
