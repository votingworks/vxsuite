import type { Api } from '@votingworks/print-backend';
import React from 'react';
import * as grout from '@votingworks/grout';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  createSystemCallApi,
  QUERY_CLIENT_DEFAULT_OPTIONS,
  USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
  asMutationFn,
} from '@votingworks/ui';
import { BallotType, LanguageCode } from '@votingworks/types';

export type ApiClient = grout.Client<Api>;

// @coverage-defer
export function createApiClient(): ApiClient {
  return grout.createClient<Api>({ baseUrl: '/api' });
}

export const ApiClientContext = React.createContext<ApiClient | undefined>(
  undefined
);

export function useApiClient(): ApiClient {
  const apiClient = React.useContext(ApiClientContext);
  // @coverage-defer
  if (!apiClient) {
    throw new Error('ApiClientContext.Provider not found');
  }
  return apiClient;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS });
}

export const getAuthStatus = {
  // @coverage-defer
  queryKey(): QueryKey {
    return ['getAuthStatus'];
  },
  // @coverage-defer
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getAuthStatus(),
      refetchInterval: AUTH_STATUS_POLLING_INTERVAL_MS,
    });
  },
} as const;

export const logOut = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.logOut),

      // @coverage-defer
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries({
          queryKey: getAuthStatus.queryKey(),
        });
      },
    });
  },
} as const;

export const updateSessionExpiry = {
  // @coverage-defer
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.updateSessionExpiry),

      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries({
          queryKey: getAuthStatus.queryKey(),
        });
      },
    });
  },
} as const;

export const getElectionRecord = {
  queryKey(): QueryKey {
    return ['getElectionRecord'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getElectionRecord(),
    });
  },
} as const;

export const getSystemSettings = {
  queryKey(): QueryKey {
    return ['getSystemSettings'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getSystemSettings(),
    });
  },
} as const;

export const hasTestBallots = {
  queryKey(): QueryKey {
    return ['hasTestBallots'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.hasTestBallots(),
    });
  },
} as const;

export const configureElectionPackageFromUsb = {
  // @coverage-defer
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.configureElectionPackageFromUsb),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getElectionRecord.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: getSystemSettings.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: hasTestBallots.queryKey(),
        });
      },
    });
  },
} as const;

export const getTestDeckBallotCount = {
  // @coverage-defer
  queryKey(input: { precinctId?: string } = {}): QueryKey {
    return ['getTestDeckBallotCount', input];
  },
  // @coverage-defer
  useQuery(input: { precinctId?: string } = {}) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(input),

      queryFn: () => apiClient.getTestDeckBallotCount(input),
    });
  },
} as const;

export const getPollingPlaceId = {
  queryKey(): QueryKey {
    return ['getPollingPlaceId'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getPollingPlaceId(),
    });
  },
} as const;

export const setPollingPlaceId = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.setPollingPlaceId),

      // @coverage-defer
      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getPollingPlaceId.queryKey(),
        });
      },
    });
  },
} as const;

export const getTestMode = {
  queryKey(): QueryKey {
    return ['getTestMode'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getTestMode(),
    });
  },
} as const;

export const getBallots = {
  // @coverage-defer
  queryKey(): QueryKey {
    return ['getBallots'];
  },
  // @coverage-defer
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getBallots({}),
    });
  },
} as const;

export const getBallotPrintCounts = {
  queryKey(): QueryKey {
    return ['getBallotPrintCounts'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getBallotPrintCounts(),
    });
  },
} as const;

export const checkPin = {
  // @coverage-defer
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.checkPin),

      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries({
          queryKey: getAuthStatus.queryKey(),
        });
      },
    });
  },
} as const;

export const printBallot = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.printBallot),

      // @coverage-defer
      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getBallotPrintCounts.queryKey(),
        });
      },
    });
  },
} as const;

export const printAllBallotStyles = {
  // @coverage-defer
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.printAllBallotStyles),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getBallotPrintCounts.queryKey(),
        });
      },
    });
  },
} as const;

export const getDistinctBallotStylesCount = {
  // @coverage-defer
  queryKey(input: {
    ballotType: BallotType;
    languageCode: LanguageCode;
  }): QueryKey {
    return ['getDistinctBallotStylesCount', input];
  },
  // @coverage-defer
  useQuery(input: { ballotType: BallotType; languageCode: LanguageCode }) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(input),
      queryFn: () => apiClient.getDistinctBallotStylesCount(input),
      placeholderData: keepPreviousData,
    });
  },
} as const;

export const setTestMode = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.setTestMode),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getTestMode.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: getBallotPrintCounts.queryKey(),
        });
      },
    });
  },
} as const;

export const unconfigureMachine = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.unconfigureMachine),

      // @coverage-defer
      async onSuccess() {
        // If we configure with a different election, any data in the cache will
        // correspond to the previous election, so we don't just invalidate, but
        // reset all queries to clear their cached data, since invalidated
        // queries may still return stale data while refetching.
        await queryClient.resetQueries();
      },
    });
  },
} as const;

export const getMachineConfig = {
  queryKeyPrefix: 'getMachineConfig',
  queryKey(): QueryKey {
    return [this.queryKeyPrefix];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getMachineConfig(),
    });
  },
} as const;

export const getDeviceStatuses = {
  queryKey(): QueryKey {
    return ['getDeviceStatuses'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getDeviceStatuses(),
      refetchInterval: USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
    });
  },
} as const;

export const ejectUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.ejectUsbDrive),

      // @coverage-defer
      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getDeviceStatuses.queryKey(),
        });
      },
    });
  },
} as const;

export const printBallotsPrintedReport = {
  // @coverage-defer
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.printBallotsPrintedReport),
    });
  },
} as const;

export const exportBallotsPrintedReportPdf = {
  // @coverage-defer
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.exportBallotsPrintedReportPdf),
    });
  },
} as const;

export const systemCallApi = createSystemCallApi(useApiClient);

export const getMostRecentPrinterDiagnostic = {
  // @coverage-defer
  queryKey(): QueryKey {
    return ['getMostRecentPrinterDiagnostic'];
  },
  // @coverage-defer
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),

      queryFn: () => apiClient.getMostRecentPrinterDiagnostic(),
    });
  },
} as const;

export const getDiskSpaceSummary = {
  // @coverage-defer
  queryKey(): QueryKey {
    return ['getDiskSpaceSummary'];
  },
  // @coverage-defer
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getDiskSpaceSummary(),
    });
  },
} as const;

export const printTestPage = {
  // @coverage-defer
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.printTestPage),
    });
  },
} as const;

export const addDiagnosticRecord = {
  // @coverage-defer
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.addDiagnosticRecord),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getMostRecentPrinterDiagnostic.queryKey(),
        });
      },
    });
  },
} as const;

export const saveReadinessReport = {
  // @coverage-defer
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.saveReadinessReport),
    });
  },
} as const;

export const printTestDeck = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.printTestDeck),
    });
  },
} as const;
