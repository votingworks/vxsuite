import type { DesignApi } from '@votingworks/admin-backend';
import {
  type ApiClient,
  isElectionEditable,
  useApiClient,
} from '@votingworks/design-ui';
import * as grout from '@votingworks/grout';
import { Buffer } from 'node:buffer';
import {
  type QueryClient,
  type QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

export type { CurrentDesign } from '@votingworks/admin-backend';

export type AdminDesignApiClient = grout.Client<DesignApi>;

export function createAdminDesignApiClient(): AdminDesignApiClient {
  return grout.createClient<DesignApi>({ baseUrl: '/design-api' });
}

export function asDesignUiApiClient(client: AdminDesignApiClient): ApiClient {
  return client;
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

const EXPORT_POLLING_INTERVAL_MS = 1000;

export const getCurrentDesign = {
  queryKey(): QueryKey {
    return ['design', 'getCurrentDesign'];
  },
  useQuery() {
    const apiClient = useAdminDesignApiClient();
    return useQuery(this.queryKey(), () => apiClient.getCurrentDesign(), {
      refetchInterval: (data) =>
        data?.export?.status === 'running' ? EXPORT_POLLING_INTERVAL_MS : false,
    });
  },
} as const;

async function invalidateDesignQueries(queryClient: QueryClient) {
  await queryClient.invalidateQueries(['design']);
}

export const createDesign = {
  useMutation() {
    const apiClient = useAdminDesignApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.createDesign, {
      async onSuccess() {
        await invalidateDesignQueries(queryClient);
      },
    });
  },
} as const;

export const loadElectionPackage = {
  useMutation() {
    const apiClient = useAdminDesignApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.loadElectionPackage, {
      async onSuccess() {
        await invalidateDesignQueries(queryClient);
      },
    });
  },
} as const;

export const discardDesign = {
  useMutation() {
    const apiClient = useAdminDesignApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.discardDesign, {
      async onSuccess() {
        await queryClient.resetQueries(['design']);
      },
    });
  },
} as const;

export const finalizeBallots = {
  useMutation() {
    const apiClient = useAdminDesignApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.finalizeBallots, {
      async onSuccess(_, { electionId }) {
        await queryClient.invalidateQueries(
          isElectionEditable.queryKey(electionId)
        );
        await queryClient.invalidateQueries(getCurrentDesign.queryKey());
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
          isElectionEditable.queryKey(electionId)
        );
        await queryClient.invalidateQueries(getCurrentDesign.queryKey());
      },
    });
  },
} as const;
