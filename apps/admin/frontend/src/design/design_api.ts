import type { DesignApi } from '@votingworks/admin-backend';
import {
  type ApiClient,
  getBallotsFinalizedAt,
  listElections,
  useApiClient,
} from '@votingworks/design-ui';
import * as grout from '@votingworks/grout';
import type { ElectionId } from '@votingworks/types';
import { Buffer } from 'node:buffer';
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

export async function saveProofToUsb(
  client: AdminDesignApiClient,
  data: Uint8Array,
  fileName: string
): Promise<void> {
  (
    await client.saveProofToUsb({ fileName, data: Buffer.from(data) })
  ).unsafeUnwrap();
}

export const getDesignStatus = {
  queryKey(): QueryKey {
    return ['design', 'getDesignStatus'];
  },
  useQuery() {
    const apiClient = useAdminDesignApiClient();
    return useQuery(this.queryKey(), () => apiClient.getDesignStatus());
  },
} as const;

export const getLocalJurisdictionId = {
  queryKey(): QueryKey {
    return ['design', 'getLocalJurisdictionId'];
  },
  useQuery() {
    const apiClient = useAdminDesignApiClient();
    return useQuery(this.queryKey(), () => apiClient.getLocalJurisdictionId());
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

const EXPORT_POLLING_INTERVAL_MS = 1000;

export const getElectionPackage = {
  queryKey(electionId: ElectionId): QueryKey {
    return ['design', 'getElectionPackage', electionId];
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
        await queryClient.invalidateQueries(
          getElectionPackage.queryKey(electionId)
        );
        await queryClient.invalidateQueries(listElections.queryKey());
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
