import type { Api } from '@votingworks/mark-backend';
import React from 'react';
import { deepEqual } from '@votingworks/basics';
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
  QUERY_CLIENT_DEFAULT_OPTIONS,
  USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
  createSystemCallApi,
  createUiStringsApi,
  asMutationFn,
} from '@votingworks/ui';
import { DiagnosticType } from '@votingworks/types';

const PRINTER_STATUS_POLLING_INTERVAL_MS = 100;
export const INTERNAL_HARDWARE_POLLING_INTERVAL_MS = 3000;

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

      structuralSharing(oldData, newData) {
        if (!oldData) {
          return newData;
        }

        // Prevent unnecessary re-renders of dependent components
        const isUnchanged = deepEqual(oldData, newData);
        return isUnchanged ? oldData : newData;
      },
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

      structuralSharing(oldData, newData) {
        if (!oldData) {
          return newData;
        }

        // Prevent unnecessary re-renders of dependent components
        const isUnchanged = deepEqual(oldData, newData);
        return isUnchanged ? oldData : newData;
      },
    });
  },
} as const;

export const getAccessibleControllerConnected = {
  queryKey(): QueryKey {
    return ['getAccessibleControllerConnected'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getAccessibleControllerConnected(),
      refetchInterval: INTERNAL_HARDWARE_POLLING_INTERVAL_MS,
    });
  },
} as const;

export const getPatInputConnected = {
  queryKey(): QueryKey {
    return ['getPatInputConnected'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getPatInputConnected(),
      refetchInterval: INTERNAL_HARDWARE_POLLING_INTERVAL_MS,
    });
  },
} as const;

export const getBarcodeConnected = {
  queryKey(): QueryKey {
    return ['getBarcodeConnected'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getBarcodeConnected(),
      refetchInterval: INTERNAL_HARDWARE_POLLING_INTERVAL_MS,
    });
  },
} as const;

const BARCODE_SCAN_POLLING_INTERVAL_MS = 200;

export const getMostRecentBarcodeScan = {
  queryKey(): QueryKey {
    return ['getMostRecentBarcodeScan'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getMostRecentBarcodeScan(),
      refetchInterval: BARCODE_SCAN_POLLING_INTERVAL_MS,
    });
  },
} as const;

export const clearLastBarcodeScan = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.clearLastBarcodeScan),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getMostRecentBarcodeScan.queryKey(),
        });
      },
    });
  },
} as const;

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

export const getElectionState = {
  queryKey(): QueryKey {
    return ['getElectionState'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getElectionState(),
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

// @coverage-exclude
export const updateSessionExpiry = {
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

export const startCardlessVoterSession = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.startCardlessVoterSession),

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

export const updateCardlessVoterBallotStyle = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.updateCardlessVoterBallotStyle),

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

export const endCardlessVoterSession = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.endCardlessVoterSession),

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

export const uiStringsApi = createUiStringsApi(useApiClient);

export const getPrintCalibration = {
  queryKey: (): QueryKey => ['getPrintCalibration'],
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getPrintCalibration(),
    });
  },
} as const;

// @coverage-defer: WIP
export const setPrintCalibration = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
      mutationFn: asMutationFn(apiClient.setPrintCalibration),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getPrintCalibration.queryKey(),
        });
      },
    });
  },
} as const;

export const configureElectionPackageFromUsb = {
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
          queryKey: getElectionState.queryKey(),
        });
        await uiStringsApi.onMachineConfigurationChange(queryClient);
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

      // [TODO] Update this to clear all query data, to match other VxSuite apps.
      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getElectionRecord.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: getSystemSettings.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: getElectionState.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: ['getUsbPortStatus'],
        });
        await uiStringsApi.onMachineConfigurationChange(queryClient);
      },
    });
  },
} as const;

export const setPollsState = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.setPollsState),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getElectionState.queryKey(),
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

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getElectionState.queryKey(),
        });
      },
    });
  },
} as const;

export const printBlankBallot = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.printBlankBallot),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getElectionState.queryKey(),
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
        await queryClient.invalidateQueries({
          queryKey: getElectionState.queryKey(),
        });
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
        await queryClient.invalidateQueries({
          queryKey: getElectionState.queryKey(),
        });
      },
    });
  },
} as const;

export const playSound = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.playSound),
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

export const getMostRecentDiagnostic = {
  queryKey(diagnosticType: DiagnosticType): QueryKey {
    return ['getMostRecentDiagnostic', diagnosticType];
  },
  useQuery(diagnosticType: DiagnosticType) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(diagnosticType),

      queryFn: () => apiClient.getMostRecentDiagnostic({ diagnosticType }),
    });
  },
} as const;

export const addDiagnosticRecord = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (
        input: Parameters<typeof apiClient.addDiagnosticRecord>[0]
      ) => apiClient.addDiagnosticRecord(input),

      async onSuccess(_, input) {
        await queryClient.invalidateQueries({
          queryKey: getMostRecentDiagnostic.queryKey(input.type),
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

export const printTestPage = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.printTestPage),
    });
  },
} as const;

export const logUpsDiagnosticOutcome = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.logUpsDiagnosticOutcome),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getMostRecentDiagnostic.queryKey(
            'uninterruptible-power-supply'
          ),
        });
      },
    });
  },
} as const;

export const systemCallApi = createSystemCallApi(useApiClient);
