import type { Api, PrecinctScannerStatus } from '@votingworks/scan-backend';
import React from 'react';
import * as grout from '@votingworks/grout';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from '@tanstack/react-query';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
  QUERY_CLIENT_DEFAULT_OPTIONS,
  createUiStringsApi,
  createSystemCallApi,
} from '@votingworks/ui';
import { DiagnosticRecord } from '@votingworks/types';

const PRINTER_STATUS_POLLING_INTERVAL_MS = 100;

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

export const getMachineConfig = {
  queryKey(): QueryKey {
    return ['getMachineConfig'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getMachineConfig());
  },
} as const;

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

export const updateSessionExpiry = {
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

export const getConfig = {
  queryKey(): QueryKey {
    return ['getConfig'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getConfig());
  },
} as const;

export const getPollsInfo = {
  queryKey(): QueryKey {
    return ['getPollsInfo'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getPollsInfo());
  },
} as const;

export const getUsbDriveStatus = {
  queryKey(): QueryKey {
    return ['getUsbDriveStatus'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getUsbDriveStatus(), {
      refetchInterval: USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
    });
  },
} as const;

export const getPrinterStatus = {
  queryKey(): QueryKey {
    return ['getPrinterStatus'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getPrinterStatus(), {
      refetchInterval: PRINTER_STATUS_POLLING_INTERVAL_MS,
    });
  },
} as const;

export const getDiskSpaceSummary = {
  queryKey(): QueryKey {
    return ['getDiskSpaceSummary'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getDiskSpaceSummary(), {
      // disk space availability could change between queries for a variety
      // reasons, so always treat it as stale
      staleTime: 0,
    });
  },
} as const;

export const getMostRecentPrinterDiagnostic = {
  queryKey(): QueryKey {
    return ['getMostRecentPrinterDiagnostic'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.getMostRecentPrinterDiagnostic()
    );
  },
} as const;

export const ejectUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.ejectUsbDrive, {
      async onSuccess() {
        await queryClient.invalidateQueries(getUsbDriveStatus.queryKey());
      },
    });
  },
} as const;

export const uiStringsApi = createUiStringsApi(useApiClient);

export const configureFromElectionPackageOnUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.configureFromElectionPackageOnUsbDrive, {
      async onSuccess() {
        await queryClient.invalidateQueries(getConfig.queryKey());
        await uiStringsApi.onMachineConfigurationChange(queryClient);
      },
    });
  },
} as const;

export const unconfigureElection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.unconfigureElection, {
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

export const setPrecinctSelection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setPrecinctSelection, {
      async onSuccess() {
        await queryClient.invalidateQueries(getConfig.queryKey());

        // Changing the precinct selection after polls open resets polls to closed
        await queryClient.invalidateQueries(getPollsInfo.queryKey());
      },
    });
  },
} as const;

export const setIsSoundMuted = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setIsSoundMuted, {
      async onSuccess() {
        await queryClient.invalidateQueries(getConfig.queryKey());
      },
    });
  },
} as const;

export const setIsDoubleFeedDetectionDisabled = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setIsDoubleFeedDetectionDisabled, {
      async onSuccess() {
        await queryClient.invalidateQueries(getConfig.queryKey());
      },
    });
  },
} as const;

export const setIsContinuousExportEnabled = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setIsContinuousExportEnabled, {
      async onSuccess() {
        await queryClient.invalidateQueries(getConfig.queryKey());
      },
    });
  },
} as const;

export const setTestMode = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setTestMode, {
      async onSuccess() {
        // If doesUsbDriveRequireCastVoteRecordSync was true, switching from test mode to official
        // mode resets it back to false. To avoid a flicker of the warning prompting you to sync
        // CVRs before you can switch from official mode to test mode, we invalidate this query
        // first.
        await queryClient.invalidateQueries(getUsbDriveStatus.queryKey());

        await queryClient.invalidateQueries(getConfig.queryKey());

        // Changing the mode after polls open resets polls to closed
        await queryClient.invalidateQueries(getPollsInfo.queryKey());
      },
    });
  },
} as const;

export const openPolls = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.openPolls, {
      async onSuccess() {
        await queryClient.invalidateQueries(getPollsInfo.queryKey());
      },
    });
  },
} as const;

export const closePolls = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.closePolls, {
      async onSuccess() {
        await queryClient.invalidateQueries(getPollsInfo.queryKey());
      },
    });
  },
} as const;

export const pauseVoting = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.pauseVoting, {
      async onSuccess() {
        await queryClient.invalidateQueries(getPollsInfo.queryKey());
      },
    });
  },
} as const;

export const resumeVoting = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.resumeVoting, {
      async onSuccess() {
        await queryClient.invalidateQueries(getPollsInfo.queryKey());
      },
    });
  },
} as const;

export const printReport = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.printReport);
  },
} as const;

export const resetPollsToPaused = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.resetPollsToPaused, {
      async onSuccess() {
        await queryClient.invalidateQueries(getPollsInfo.queryKey());
      },
    });
  },
} as const;

export const exportCastVoteRecordsToUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportCastVoteRecordsToUsbDrive);
  },
} as const;

export const getScannerStatus = {
  queryKey(): QueryKey {
    return ['getScannerStatus'];
  },
  useQuery(options?: UseQueryOptions<PrecinctScannerStatus>) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.getScannerStatus(),
      options
    );
  },
} as const;

export const acceptBallot = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.acceptBallot);
  },
} as const;

export const returnBallot = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.returnBallot);
  },
} as const;

export const readyForNextBallot = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.readyForNextBallot);
  },
} as const;

export const beginDoubleFeedCalibration = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.beginDoubleFeedCalibration);
  },
} as const;

export const endDoubleFeedCalibration = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.endDoubleFeedCalibration);
  },
} as const;

export const beginImageSensorCalibration = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.beginImageSensorCalibration);
  },
} as const;

export const endImageSensorCalibration = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.endImageSensorCalibration);
  },
} as const;

export const getMostRecentScannerDiagnostic = {
  queryKey(): QueryKey {
    return ['getMostRecentScannerDiagnostic'];
  },
  useQuery(options?: UseQueryOptions<DiagnosticRecord | null>) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.getMostRecentScannerDiagnostic(),
      options
    );
  },
} as const;

export const beginScannerDiagnostic = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.beginScannerDiagnostic, {
      async onSuccess() {
        await queryClient.invalidateQueries(getScannerStatus.queryKey());
      },
    });
  },
} as const;

export const endScannerDiagnostic = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.endScannerDiagnostic, {
      async onSuccess() {
        await queryClient.invalidateQueries(
          getMostRecentScannerDiagnostic.queryKey()
        );
        await queryClient.invalidateQueries(getScannerStatus.queryKey());
      },
    });
  },
} as const;

// applicable for V4 hardware only
export const printReportSection = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.printReportSection);
  },
} as const;

// applicable for V4 hardware only
export const printTestPage = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.printTestPage, {
      async onSuccess() {
        await queryClient.invalidateQueries(
          getMostRecentPrinterDiagnostic.queryKey()
        );
      },
    });
  },
} as const;

export const logTestPrintOutcome = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.logTestPrintOutcome, {
      async onSuccess() {
        await queryClient.invalidateQueries(
          getMostRecentPrinterDiagnostic.queryKey()
        );
      },
    });
  },
} as const;

export const getMostRecentAudioDiagnostic = {
  queryKey(): QueryKey {
    return ['getMostAudioDiagnostic'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.getMostRecentAudioDiagnostic()
    );
  },
} as const;

export const logAudioDiagnosticOutcome = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.logAudioDiagnosticOutcome, {
      async onSuccess() {
        await queryClient.invalidateQueries(
          getMostRecentAudioDiagnostic.queryKey()
        );
      },
    });
  },
} as const;

export const saveReadinessReport = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.saveReadinessReport);
  },
} as const;

export const saveBallotAuditIdSecretKey = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.saveBallotAuditIdSecretKey);
  },
} as const;

export const systemCallApi = createSystemCallApi(useApiClient);

export const playSound = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.playSound);
  },
} as const;
