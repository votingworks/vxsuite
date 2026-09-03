import type {
  Api,
  PrecinctScannerStatus,
  SoundName,
} from '@votingworks/scan-backend';
import React from 'react';
import * as grout from '@votingworks/grout';
import {
  QueryClient,
  QueryKey,
  useMutation,
  UseMutationResult,
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
  useAudioControls,
  useAudioEnabled,
  asMutationFn,
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
  // @coverage-defer
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
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getMachineConfig(),
    });
  },
} as const;

export const getAuthStatus = {
  queryKey(): QueryKey {
    return ['getAuthStatus'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getAuthStatus(),
      refetchInterval: AUTH_STATUS_POLLING_INTERVAL_MS,
    });
  },
} as const;

export const checkPin = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.checkPin),

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

export const logOut = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.logOut),

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
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.updateSessionExpiry),

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

export const getConfig = {
  queryKey(): QueryKey {
    return ['getConfig'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getConfig(),
    });
  },
} as const;

export const getPollsInfo = {
  queryKey(): QueryKey {
    return ['getPollsInfo'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getPollsInfo(),
    });
  },
} as const;

export const getUsbDriveStatus = {
  queryKey(): QueryKey {
    return ['getUsbDriveStatus'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getUsbDriveStatus(),
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
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getPrinterStatus(),
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
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getDiskSpaceSummary(),

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
    return useQuery({
      queryKey: this.queryKey(),

      queryFn: () => apiClient.getMostRecentPrinterDiagnostic(),
    });
  },
} as const;

export const ejectUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.ejectUsbDrive),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getUsbDriveStatus.queryKey(),
        });
      },
    });
  },
} as const;

export const uiStringsApi = createUiStringsApi(useApiClient);

export const configureFromElectionPackageOnUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(
        apiClient.configureFromElectionPackageOnUsbDrive
      ),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getConfig.queryKey(),
        });
        await uiStringsApi.onMachineConfigurationChange(queryClient);
      },
    });
  },
} as const;

export const unconfigureElection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.unconfigureElection),

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

export const setPollingPlaceId = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.setPollingPlaceId),

      async onSuccess() {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: getConfig.queryKey(),
          }),

          // Changing the polling place after polls open resets polls to closed
          queryClient.invalidateQueries({
            queryKey: getPollsInfo.queryKey(),
          }),
        ]);
      },
    });
  },
} as const;

export const setIsSoundMuted = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.setIsSoundMuted),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getConfig.queryKey(),
        });
      },
    });
  },
} as const;

export const setIsDoubleFeedDetectionDisabled = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.setIsDoubleFeedDetectionDisabled),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getConfig.queryKey(),
        });
      },
    });
  },
} as const;

export const setIsContinuousExportEnabled = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.setIsContinuousExportEnabled),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getConfig.queryKey(),
        });
      },
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
        // If doesUsbDriveRequireCastVoteRecordSync was true, switching from test mode to official
        // mode resets it back to false. To avoid a flicker of the warning prompting you to sync
        // CVRs before you can switch from official mode to test mode, we invalidate this query
        // first.
        await queryClient.invalidateQueries({
          queryKey: getUsbDriveStatus.queryKey(),
        });

        await queryClient.invalidateQueries({
          queryKey: getConfig.queryKey(),
        });

        // Changing the mode after polls open resets polls to closed
        await queryClient.invalidateQueries({
          queryKey: getPollsInfo.queryKey(),
        });
      },
    });
  },
} as const;

export const setBallotCastingMode = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.setBallotCastingMode),

      // @coverage-defer
      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getConfig.queryKey(),
        });
      },
    });
  },
} as const;

export const getQuickResultsReportingUrl = {
  queryKey(): QueryKey {
    return ['getQuickResultsReportingUrl'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getQuickResultsReportingUrl(),
      gcTime: 0,
    });
  },
} as const;

export const openPolls = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.openPolls),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getPollsInfo.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: getQuickResultsReportingUrl.queryKey(),
        });
      },
    });
  },
} as const;

export const closePolls = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.closePolls),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getPollsInfo.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: getQuickResultsReportingUrl.queryKey(),
        });
      },
    });
  },
} as const;

export const pauseVoting = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.pauseVoting),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getPollsInfo.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: getQuickResultsReportingUrl.queryKey(),
        });
      },
    });
  },
} as const;

export const resumeVoting = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.resumeVoting),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getPollsInfo.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: getQuickResultsReportingUrl.queryKey(),
        });
      },
    });
  },
} as const;

export const resetPollsToPaused = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.resetPollsToPaused),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getPollsInfo.queryKey(),
        });
      },
    });
  },
} as const;

export const exportCastVoteRecordsToUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.exportCastVoteRecordsToUsbDrive),
    });
  },
} as const;

export const getScannerStatus = {
  queryKey(): QueryKey {
    return ['getScannerStatus'];
  },
  /**
   * AppRoot (which is always mounted) is the only component that should pass
   * a `refetchInterval`. react-query runs a separate refetch timer for every
   * observer that sets one, so a second polling component would double the
   * request rate to the backend. Everything else should subscribe with
   * `useQuery()` and receive updates through the shared query cache.
   */
  useQuery(
    options: Omit<
      UseQueryOptions<PrecinctScannerStatus>,
      'queryKey' | 'queryFn'
    > = {}
  ) {
    const apiClient = useApiClient();
    return useQuery({
      ...options,
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getScannerStatus(),
    });
  },
} as const;

export const acceptBallot = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.acceptBallot),
    });
  },
} as const;

export const returnBallot = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.returnBallot),
    });
  },
} as const;

export const readyForNextBallot = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.readyForNextBallot),
    });
  },
} as const;

export const beginDoubleFeedCalibration = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.beginDoubleFeedCalibration),
    });
  },
} as const;

export const endDoubleFeedCalibration = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.endDoubleFeedCalibration),
    });
  },
} as const;

export const beginImageSensorCalibration = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.beginImageSensorCalibration),
    });
  },
} as const;

export const endImageSensorCalibration = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.endImageSensorCalibration),
    });
  },
} as const;

export const getMostRecentScannerDiagnostic = {
  queryKey(): QueryKey {
    return ['getMostRecentScannerDiagnostic'];
  },
  useQuery(
    options: Omit<
      UseQueryOptions<DiagnosticRecord | null>,
      'queryKey' | 'queryFn'
    > = {}
  ) {
    const apiClient = useApiClient();
    return useQuery({
      ...options,
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getMostRecentScannerDiagnostic(),
    });
  },
} as const;

export const beginScannerDiagnostic = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.beginScannerDiagnostic),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getScannerStatus.queryKey(),
        });
      },
    });
  },
} as const;

export const endScannerDiagnostic = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.endScannerDiagnostic),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getMostRecentScannerDiagnostic.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: getScannerStatus.queryKey(),
        });
      },
    });
  },
} as const;

export const printReportSection = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.printReportSection),
    });
  },
} as const;

export const printWriteInImageReport = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.printWriteInImageReport),
    });
  },
} as const;

export const printTestPage = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.printTestPage),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getMostRecentPrinterDiagnostic.queryKey(),
        });
      },
    });
  },
} as const;

export const logTestPrintOutcome = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.logTestPrintOutcome),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getMostRecentPrinterDiagnostic.queryKey(),
        });
      },
    });
  },
} as const;

export const getMostRecentAudioDiagnostic = {
  queryKey(): QueryKey {
    return ['getMostRecentAudioDiagnostic'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),

      queryFn: () => apiClient.getMostRecentAudioDiagnostic(),
    });
  },
} as const;

export const getMostRecentUpsDiagnostic = {
  queryKey(): QueryKey {
    return ['getMostRecentUpsDiagnostic'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),

      queryFn: () => apiClient.getMostRecentUpsDiagnostic(),
    });
  },
} as const;

export const logAudioDiagnosticOutcome = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.logAudioDiagnosticOutcome),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getMostRecentAudioDiagnostic.queryKey(),
        });
      },
    });
  },
} as const;

export const logUpsDiagnosticOutcome = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.logUpsDiagnosticOutcome),

      // @coverage-defer
      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getMostRecentUpsDiagnostic.queryKey(),
        });
      },
    });
  },
} as const;

export const saveReadinessReport = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.saveReadinessReport),
    });
  },
} as const;

export const saveBallotAuditIdSecretKey = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.saveBallotAuditIdSecretKey),
    });
  },
} as const;

export const systemCallApi = createSystemCallApi(useApiClient);

export const playSound = {
  useMutation: () => usePlaySoundMutation(useApiClient),
} as const;

/**
 * {@link playSound} client implementation, broken out for sharing with
 * the HWTA client.
 */
export function usePlaySoundMutation(
  useClient: () => Pick<ApiClient, 'playSound'>
): UseMutationResult<void, Error, { name: SoundName }, unknown> {
  const ttsAudio = useAudioControls();
  const ttsWasEnabled = React.useRef(useAudioEnabled());

  const apiClient = useClient();
  return useMutation({
    mutationFn: async (input: { name: SoundName }) => {
      // This assumes VxScan uses the builtin audio card for both speaker and
      // headphones output.
      // When playing sounds through the server (which involves switching all
      // audio over to the speaker), we first mute the TTS audio to avoid
      // conflicting audio/unintelligible speech.
      ttsAudio.setIsEnabled(false);

      await apiClient.playSound(input);

      ttsAudio.setIsEnabled(ttsWasEnabled.current);
    },
  });
}
