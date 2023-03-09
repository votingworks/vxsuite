import React from 'react';
import type { Api } from '@votingworks/admin-backend'; // eslint-disable-line vx/gts-no-import-export-type
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  QUERY_CLIENT_DEFAULT_OPTIONS,
} from '@votingworks/ui';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as grout from '@votingworks/grout';

export type ApiClient = grout.Client<Api>;

export function createApiClient(): ApiClient {
  return grout.createClient<Api>({ baseUrl: '/api' });
}

export const ApiClientContext = React.createContext<ApiClient | undefined>(
  undefined
);

export function useApiClient(): ApiClient {
  const apiClient = React.useContext(ApiClientContext);
  if (!apiClient) {
    throw new Error('ApiClientContext.Provider not found');
  }
  return apiClient;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS });
}

// Auth

export const getAuthStatus = {
  queryKey(): QueryKey {
    return ['getAuthStatus'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getAuthStatus(), {
      refetchInterval: AUTH_STATUS_POLLING_INTERVAL_MS,
    });
  },
} as const;

export const checkPin = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.checkPin, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

export const logOut = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.logOut, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

export const programCard = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.programCard, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

export const unprogramCard = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.unprogramCard, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

// Queries

type QueryInput<Method extends keyof ApiClient> = Parameters<
  ApiClient[Method]
>[0];

export const getCurrentElectionMetadata = {
  queryKey(): QueryKey {
    return ['getCurrentElectionMetadata'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.getCurrentElectionMetadata()
    );
  },
} as const;

export const getCastVoteRecordFiles = {
  queryKey(): QueryKey {
    return ['getCastVoteRecordFiles'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getCastVoteRecordFiles());
  },
} as const;

export const getCastVoteRecords = {
  queryKey(): QueryKey {
    return ['getCastVoteRecords'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getCastVoteRecords());
  },
} as const;

export const getCastVoteRecordFileMode = {
  queryKey(): QueryKey {
    return ['getCastVoteRecordFileMode'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.getCastVoteRecordFileMode()
    );
  },
} as const;

type GetWriteInsInput = QueryInput<'getWriteIns'>;
export const getWriteIns = {
  queryKey(input?: GetWriteInsInput): QueryKey {
    return input ? ['getWriteIns', input] : ['getWriteIns'];
  },
  useQuery(input?: GetWriteInsInput) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(input), () => apiClient.getWriteIns(input));
  },
} as const;

type GetWriteInSummaryInput = QueryInput<'getWriteInSummary'>;
export const getWriteInSummary = {
  queryKey(input?: GetWriteInSummaryInput): QueryKey {
    return input ? ['getWriteInSummary', input] : ['getWriteInSummary'];
  },
  useQuery(input?: GetWriteInSummaryInput) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(input), () =>
      apiClient.getWriteInSummary(input)
    );
  },
} as const;

type GetWriteInAdjudicationTableInput =
  QueryInput<'getWriteInAdjudicationTable'>;
export const getWriteInAdjudicationTable = {
  queryKey(input?: GetWriteInAdjudicationTableInput): QueryKey {
    return input
      ? ['getWriteInAdjudicationTable', input]
      : ['getWriteInAdjudicationTable'];
  },
  useQuery(input: GetWriteInAdjudicationTableInput) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(input), () =>
      apiClient.getWriteInAdjudicationTable(input)
    );
  },
} as const;

type GetWriteInImageInput = QueryInput<'getWriteInImage'>;
export const getWriteInImage = {
  queryKey(input?: GetWriteInImageInput): QueryKey {
    return input ? ['getWriteInImage', input] : ['getWriteInImage'];
  },
  useQuery(input: GetWriteInImageInput) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(input), () =>
      apiClient.getWriteInImage(input)
    );
  },
} as const;

type GetPrintedBallotsInput = QueryInput<'getPrintedBallots'>;
export const getPrintedBallots = {
  queryKey(input?: GetPrintedBallotsInput): QueryKey {
    return input ? ['getPrintedBallots', input] : ['getPrintedBallots'];
  },
  useQuery(input?: GetPrintedBallotsInput) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(input), () =>
      apiClient.getPrintedBallots(input)
    );
  },
} as const;

// Grouped Invalidations

function invalidateCastVoteRecordQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries(getCastVoteRecordFileMode.queryKey()),
    queryClient.invalidateQueries(getCastVoteRecordFiles.queryKey()),
    queryClient.invalidateQueries(getCastVoteRecords.queryKey()),
  ]);
}

function invalidateWriteInQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries(getWriteIns.queryKey()),
    queryClient.invalidateQueries(getWriteInSummary.queryKey()),
    queryClient.invalidateQueries(getWriteInAdjudicationTable.queryKey()),
  ]);
}

// Mutations

export const configure = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.configure, {
      async onSuccess() {
        await queryClient.invalidateQueries(
          getCurrentElectionMetadata.queryKey()
        );
      },
    });
  },
} as const;

export const unconfigure = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.unconfigure, {
      async onSuccess() {
        await queryClient.invalidateQueries();
      },
    });
  },
} as const;

export const markResultsOfficial = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.markResultsOfficial, {
      async onSuccess() {
        await queryClient.invalidateQueries(
          getCurrentElectionMetadata.queryKey()
        );
      },
    });
  },
} as const;

export const clearCastVoteRecordFiles = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.clearCastVoteRecordFiles, {
      async onSuccess() {
        return Promise.all([
          invalidateCastVoteRecordQueries(queryClient),
          invalidateWriteInQueries(queryClient),
          queryClient.invalidateQueries(getWriteInImage.queryKey()),
          queryClient.invalidateQueries(getCurrentElectionMetadata.queryKey()),
        ]);
      },
    });
  },
} as const;

export const addCastVoteRecordFile = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.addCastVoteRecordFile, {
      async onSuccess() {
        await invalidateCastVoteRecordQueries(queryClient);
        await invalidateWriteInQueries(queryClient);
      },
    });
  },
} as const;

export const transcribeWriteIn = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.transcribeWriteIn, {
      async onSuccess() {
        await invalidateWriteInQueries(queryClient);
      },
    });
  },
} as const;

export const adjudicateWriteInTranscription = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.createWriteInAdjudication, {
      async onSuccess() {
        await invalidateWriteInQueries(queryClient);
      },
    });
  },
} as const;

export const updateWriteInAdjudication = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.updateWriteInAdjudication, {
      async onSuccess() {
        await invalidateWriteInQueries(queryClient);
      },
    });
  },
} as const;

export const deleteWriteInAdjudication = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.deleteWriteInAdjudication, {
      async onSuccess() {
        await invalidateWriteInQueries(queryClient);
      },
    });
  },
} as const;

export const addPrintedBallots = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.addPrintedBallots, {
      async onSuccess() {
        await queryClient.invalidateQueries(getPrintedBallots.queryKey());
      },
    });
  },
} as const;
