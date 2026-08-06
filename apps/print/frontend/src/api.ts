import type { Api } from '@votingworks/print-backend';
import React from 'react';
import * as grout from '@votingworks/grout';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  createSystemCallApi,
  QUERY_CLIENT_DEFAULT_OPTIONS,
  USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
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
    return useQuery(this.queryKey(), () => apiClient.getAuthStatus(), {
      refetchInterval: AUTH_STATUS_POLLING_INTERVAL_MS,
    });
  },
} as const;

export const logOut = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.logOut, {
      // @coverage-defer
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

export const updateSessionExpiry = {
  // @coverage-defer
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.updateSessionExpiry, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
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
    return useQuery(this.queryKey(), () => apiClient.getElectionRecord());
  },
} as const;

export const getSystemSettings = {
  queryKey(): QueryKey {
    return ['getSystemSettings'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getSystemSettings());
  },
} as const;

export const configureElectionPackageFromUsb = {
  // @coverage-defer
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(() => apiClient.configureElectionPackageFromUsb(), {
      async onSuccess() {
        await queryClient.invalidateQueries(getElectionRecord.queryKey());
        await queryClient.invalidateQueries(getSystemSettings.queryKey());
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
    return useQuery(this.queryKey(input), () =>
      apiClient.getTestDeckBallotCount(input)
    );
  },
} as const;

export const getPollingPlaceId = {
  queryKey(): QueryKey {
    return ['getPollingPlaceId'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getPollingPlaceId());
  },
} as const;

export const setPollingPlaceId = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setPollingPlaceId, {
      // @coverage-defer
      async onSuccess() {
        await queryClient.invalidateQueries(getPollingPlaceId.queryKey());
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
    return useQuery(this.queryKey(), () => apiClient.getTestMode());
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
    return useQuery(this.queryKey(), () => apiClient.getBallots({}));
  },
} as const;

export const getBallotPrintCounts = {
  // @coverage-defer
  queryKey(): QueryKey {
    return ['getBallotPrintCounts'];
  },
  // @coverage-defer
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getBallotPrintCounts());
  },
} as const;

export const checkPin = {
  // @coverage-defer
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

export const printBallot = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.printBallot, {
      // @coverage-defer
      async onSuccess() {
        await queryClient.invalidateQueries(getBallotPrintCounts.queryKey());
      },
    });
  },
} as const;

export const printAllBallotStyles = {
  // @coverage-defer
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.printAllBallotStyles, {
      async onSuccess() {
        await queryClient.invalidateQueries(getBallotPrintCounts.queryKey());
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
    return useQuery(
      this.queryKey(input),
      () => apiClient.getDistinctBallotStylesCount(input),
      { keepPreviousData: true }
    );
  },
} as const;

export const setTestMode = {
  // @coverage-defer
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setTestMode, {
      async onSuccess() {
        await queryClient.invalidateQueries(getTestMode.queryKey());
        await queryClient.invalidateQueries(getBallotPrintCounts.queryKey());
      },
    });
  },
} as const;

export const unconfigureMachine = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.unconfigureMachine, {
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
    return useQuery(this.queryKey(), () => apiClient.getMachineConfig());
  },
} as const;

export const getDeviceStatuses = {
  queryKey(): QueryKey {
    return ['getDeviceStatuses'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getDeviceStatuses(), {
      refetchInterval: USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
    });
  },
} as const;

export const ejectUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.ejectUsbDrive, {
      // @coverage-defer
      async onSuccess() {
        await queryClient.invalidateQueries(getDeviceStatuses.queryKey());
      },
    });
  },
} as const;

export const printBallotsPrintedReport = {
  // @coverage-defer
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.printBallotsPrintedReport);
  },
} as const;

export const exportBallotsPrintedReportPdf = {
  // @coverage-defer
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportBallotsPrintedReportPdf);
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
    return useQuery(this.queryKey(), () =>
      apiClient.getMostRecentPrinterDiagnostic()
    );
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
    return useQuery(this.queryKey(), () => apiClient.getDiskSpaceSummary());
  },
} as const;

export const printTestPage = {
  // @coverage-defer
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.printTestPage);
  },
} as const;

export const addDiagnosticRecord = {
  // @coverage-defer
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.addDiagnosticRecord, {
      async onSuccess() {
        await queryClient.invalidateQueries(
          getMostRecentPrinterDiagnostic.queryKey()
        );
      },
    });
  },
} as const;

export const saveReadinessReport = {
  // @coverage-defer
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.saveReadinessReport);
  },
} as const;

export const printTestDeck = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.printTestDeck);
  },
} as const;
