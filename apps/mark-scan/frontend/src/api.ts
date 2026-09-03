import type { Api } from '@votingworks/mark-scan-backend';
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
  QUERY_CLIENT_DEFAULT_OPTIONS,
  USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
  createSystemCallApi,
  createUiStringsApi,
  asMutationFn,
} from '@votingworks/ui';
import { deepEqual } from '@votingworks/basics';
import { DiagnosticType } from '@votingworks/types';
import {
  ACCESSIBLE_CONTROLLER_DIAGNOSTIC_POLLING_INTERVAL_MS,
  AUTH_STATUS_POLLING_INTERVAL_MS_OVERRIDE,
  STATE_MACHINE_POLLING_INTERVAL_MS,
} from './constants.js';

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

export const getInterpretation = {
  queryKey(): QueryKey {
    return ['getInterpretation'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getInterpretation(),

      // Avoid caching interpretation results to avoid any potential flicker
      // between re-renders on interpretation results:
      gcTime: 0,
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
      refetchInterval: AUTH_STATUS_POLLING_INTERVAL_MS_OVERRIDE,
    });
  },
} as const;

export const getStateMachineState = {
  queryKey(): QueryKey {
    return ['getStateMachineState'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getPaperHandlerState(),
      refetchInterval: STATE_MACHINE_POLLING_INTERVAL_MS,
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
    });
  },
} as const;

export const getMostRecentDiagnostic = {
  queryKey(diagnosticType: DiagnosticType): QueryKey {
    return ['getMostRecentPaperHandlerDiagnostic', diagnosticType];
  },
  useQuery(diagnosticType: DiagnosticType) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(diagnosticType),

      queryFn: () =>
        apiClient.getMostRecentDiagnostic({
          diagnosticType,
        }),
    });
  },
} as const;

export const getIsAccessibleControllerInputDetected = {
  queryKey(): QueryKey {
    return ['getIsAccessibleControllerInputDetected'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getIsAccessibleControllerInputDetected(),
      refetchInterval: ACCESSIBLE_CONTROLLER_DIAGNOSTIC_POLLING_INTERVAL_MS,
    });
  },
} as const;

export const getIsPatDeviceConnected = {
  queryKey(): QueryKey {
    return ['getIsPatDeviceConnected'];
  },

  useQuery() {
    const apiClient = useApiClient();

    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getIsPatDeviceConnected(),
      refetchInterval: STATE_MACHINE_POLLING_INTERVAL_MS,
    });
  },
} as const;

export const getMarkScanBmdModel = {
  queryKey(): QueryKey {
    return ['getMarkScanBmdModel'];
  },

  useQuery() {
    const apiClient = useApiClient();

    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getMarkScanBmdModel(),
    });
  },
} as const;

export const addDiagnosticRecord = {
  useMutation(diagnosticType: DiagnosticType) {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.addDiagnosticRecord),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getMostRecentDiagnostic.queryKey(diagnosticType),
        });
      },
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
        // We invalidate getInterpretation when the ballot is validated or invalidated by the voter,
        // but it's also possible for the ballot to be physically pulled before the validation stage.
        // In that case, we need to invalidate getInterpretation at the start of the next session.
        await queryClient.invalidateQueries({
          queryKey: getInterpretation.queryKey(),
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
        // Because we poll auth status with high frequency, auth invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries({
          queryKey: getAuthStatus.queryKey(),
        });
      },
    });
  },
} as const;

export const uiStringsApi = createUiStringsApi(useApiClient);

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

export const printBallot = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.printBallot),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getStateMachineState.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: getElectionState.queryKey(),
        });
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

export const setAcceptingPaperState = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.setAcceptingPaperState),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getStateMachineState.queryKey(),
        });
      },
    });
  },
} as const;

export const validateBallot = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.validateBallot),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getStateMachineState.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: getInterpretation.queryKey(),
        });
      },
    });
  },
} as const;

export const invalidateBallot = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.invalidateBallot),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getStateMachineState.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: getInterpretation.queryKey(),
        });
      },
    });
  },
} as const;

export const confirmInvalidateBallot = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.confirmInvalidateBallot),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getStateMachineState.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: getInterpretation.queryKey(),
        });
      },
    });
  },
} as const;

export const confirmBallotBoxEmptied = {
  useMutation() {
    const apiClient = useApiClient();
    // There are no queries to invalidate because ballot box
    // capacity isn't exposed to the frontend.
    return useMutation({
      mutationFn: asMutationFn(apiClient.confirmBallotBoxEmptied),
    });
  },
} as const;

export const setPatDeviceIsCalibrated = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.setPatDeviceIsCalibrated),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getStateMachineState.queryKey(),
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

export const startPaperHandlerDiagnostic = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.startPaperHandlerDiagnostic),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getStateMachineState.queryKey(),
        });
      },
    });
  },
} as const;

export const stopPaperHandlerDiagnostic = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.stopPaperHandlerDiagnostic),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getStateMachineState.queryKey(),
        });
      },
    });
  },
} as const;

export const systemCallApi = createSystemCallApi(useApiClient);

export const startSessionWithPreprintedBallot = {
  useMutation: () =>
    useMutation({
      mutationFn: useApiClient().startSessionWithPreprintedBallot,
    }),
} as const;

export const returnPreprintedBallot = {
  useMutation: () =>
    useMutation({
      mutationFn: useApiClient().returnPreprintedBallot,
    }),
} as const;

// @coverage-exclude
export const getMockPaperHandlerStatus = {
  queryKey: ['getMockPaperHandlerStatus'] as QueryKey,

  useQuery() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    const result = useQuery({
      queryKey: this.queryKey,

      queryFn: () => apiClient.getMockPaperHandlerStatus(),
    });

    // Re-fetch whenever the state machine state changes to avoid additional
    // polling:
    const stateMachineState = getStateMachineState.useQuery().data;
    React.useEffect(() => {
      void queryClient.invalidateQueries({
        queryKey: this.queryKey,
      });
    }, [queryClient, stateMachineState]);

    return result;
  },
} as const;

// @coverage-exclude
export const setMockPaperHandlerStatus = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
      mutationFn: asMutationFn(apiClient.setMockPaperHandlerStatus),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getMockPaperHandlerStatus.queryKey,
        });
      },
    });
  },
} as const;
