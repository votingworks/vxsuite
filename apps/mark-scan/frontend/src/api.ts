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
} from '@votingworks/ui';
import { deepEqual } from '@votingworks/basics';
import {
  ACCESSIBLE_CONTROLLER_DIAGNOSTIC_POLLING_INTERVAL_MS,
  AUTH_STATUS_POLLING_INTERVAL_MS_OVERRIDE,
  STATE_MACHINE_POLLING_INTERVAL_MS,
} from './constants';

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
    return useQuery(this.queryKey(), () => apiClient.getUsbDriveStatus(), {
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
    return useMutation(apiClient.ejectUsbDrive, {
      async onSuccess() {
        await queryClient.invalidateQueries(getUsbDriveStatus.queryKey());
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
    return useQuery(this.queryKey(), () => apiClient.getMachineConfig());
  },
} as const;

export const getElectionDefinition = {
  queryKey(): QueryKey {
    return ['getElectionDefinition'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getElectionDefinition());
  },
} as const;

export const getInterpretation = {
  queryKey(): QueryKey {
    return ['getInterpretation'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getInterpretation(), {
      // Avoid caching interpretation results to avoid any potential flicker
      // between re-renders on interpretation results:
      cacheTime: 0,
    });
  },
} as const;

/* istanbul ignore next */
export const getSystemSettings = {
  queryKey(): QueryKey {
    return ['getSystemSettings'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getSystemSettings());
  },
} as const;

export const getElectionState = {
  queryKey(): QueryKey {
    return ['getElectionState'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getElectionState());
  },
} as const;

export const getAuthStatus = {
  queryKey(): QueryKey {
    return ['getAuthStatus'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getAuthStatus(), {
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
    return useQuery(this.queryKey(), () => apiClient.getPaperHandlerState(), {
      refetchInterval: STATE_MACHINE_POLLING_INTERVAL_MS,
    });
  },
} as const;

export const getApplicationDiskSpaceSummary = {
  queryKey(): QueryKey {
    return ['getApplicationDiskSpaceSummary'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.getApplicationDiskSpaceSummary()
    );
  },
} as const;

export const getMostRecentPaperHandlerDiagnostic = {
  queryKey(): QueryKey {
    return ['getMostRecentPaperHandlerDiagnostic'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () =>
        apiClient.getMostRecentDiagnostic({
          diagnosticType: 'mark-scan-paper-handler',
        }),
      { cacheTime: 0 }
    );
  },
} as const;

export const getMostRecentAccessibleControllerDiagnostic = {
  queryKey(): QueryKey {
    return ['getMostRecentAccessibleControllerDiagnostic'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.getMostRecentDiagnostic({
        diagnosticType: 'mark-scan-accessible-controller',
      })
    );
  },
} as const;

export const getIsAccessibleControllerInputDetected = {
  queryKey(): QueryKey {
    return ['getIsAccessibleControllerInputDetected'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.getIsAccessibleControllerInputDetected(),
      {
        refetchInterval: ACCESSIBLE_CONTROLLER_DIAGNOSTIC_POLLING_INTERVAL_MS,
      }
    );
  },
} as const;

export const addDiagnosticRecord = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.addDiagnosticRecord, {
      async onSuccess() {
        await queryClient.invalidateQueries(
          getMostRecentAccessibleControllerDiagnostic.queryKey()
        );
      },
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

/* istanbul ignore next */
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

/* istanbul ignore next */
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

export const startCardlessVoterSession = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.startCardlessVoterSession, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
        // We invalidate getInterpretation when the ballot is validated or invalidated by the voter,
        // but it's also possible for the ballot to be physically pulled before the validation stage.
        // In that case, we need to invalidate getInterpretation at the start of the next session.
        await queryClient.invalidateQueries(getInterpretation.queryKey());
      },
    });
  },
} as const;

export const updateCardlessVoterBallotStyle = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.updateCardlessVoterBallotStyle, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

export const endCardlessVoterSession = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.endCardlessVoterSession, {
      async onSuccess() {
        // Because we poll auth status with high frequency, auth invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

export const uiStringsApi = createUiStringsApi(useApiClient);

export const configureElectionPackageFromUsb = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(() => apiClient.configureElectionPackageFromUsb(), {
      async onSuccess() {
        await queryClient.invalidateQueries(getElectionDefinition.queryKey());
        await queryClient.invalidateQueries(getSystemSettings.queryKey());
        await queryClient.invalidateQueries(getElectionState.queryKey());
        await uiStringsApi.onMachineConfigurationChange(queryClient);
      },
    });
  },
} as const;

export const unconfigureMachine = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(() => apiClient.unconfigureMachine(), {
      async onSuccess() {
        await queryClient.invalidateQueries(getElectionDefinition.queryKey());
        await queryClient.invalidateQueries(getSystemSettings.queryKey());
        await queryClient.invalidateQueries(getElectionState.queryKey());
        await uiStringsApi.onMachineConfigurationChange(queryClient);
      },
    });
  },
} as const;

export const printBallot = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.printBallot, {
      async onSuccess() {
        await queryClient.invalidateQueries(getStateMachineState.queryKey());
        await queryClient.invalidateQueries(getElectionState.queryKey());
      },
    });
  },
} as const;

export const setPollsState = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setPollsState, {
      async onSuccess() {
        await queryClient.invalidateQueries(getElectionState.queryKey());
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
        await queryClient.invalidateQueries(getElectionState.queryKey());
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
        await queryClient.invalidateQueries(getElectionState.queryKey());
      },
    });
  },
} as const;

export const setAcceptingPaperState = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setAcceptingPaperState, {
      async onSuccess() {
        await queryClient.invalidateQueries(getStateMachineState.queryKey());
      },
    });
  },
} as const;

export const validateBallot = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.validateBallot, {
      async onSuccess() {
        await queryClient.invalidateQueries(getStateMachineState.queryKey());
        await queryClient.invalidateQueries(getInterpretation.queryKey());
      },
    });
  },
} as const;

export const confirmSessionEnd = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.confirmSessionEnd, {
      async onSuccess() {
        await queryClient.invalidateQueries(getStateMachineState.queryKey());
        await queryClient.invalidateQueries(getInterpretation.queryKey());
      },
    });
  },
} as const;

export const invalidateBallot = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.invalidateBallot, {
      async onSuccess() {
        await queryClient.invalidateQueries(getStateMachineState.queryKey());
        await queryClient.invalidateQueries(getInterpretation.queryKey());
      },
    });
  },
} as const;

export const confirmInvalidateBallot = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.confirmInvalidateBallot, {
      async onSuccess() {
        await queryClient.invalidateQueries(getStateMachineState.queryKey());
        await queryClient.invalidateQueries(getInterpretation.queryKey());
      },
    });
  },
} as const;

export const confirmBallotBoxEmptied = {
  useMutation() {
    const apiClient = useApiClient();
    // There are no queries to invalidate because ballot box
    // capacity isn't exposed to the frontend.
    return useMutation(apiClient.confirmBallotBoxEmptied);
  },
} as const;

export const setPatDeviceIsCalibrated = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setPatDeviceIsCalibrated, {
      async onSuccess() {
        await queryClient.invalidateQueries(getStateMachineState.queryKey());
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

export const isPatDeviceConnected = {
  queryKey(): QueryKey {
    return ['isPatDeviceConnected'];
  },

  useQuery() {
    const apiClient = useApiClient();

    return useQuery(this.queryKey(), () => apiClient.isPatDeviceConnected(), {
      refetchInterval: STATE_MACHINE_POLLING_INTERVAL_MS,
    });
  },
} as const;

export const startPaperHandlerDiagnostic = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.startPaperHandlerDiagnostic, {
      async onSuccess() {
        await queryClient.invalidateQueries(getStateMachineState.queryKey());
      },
    });
  },
} as const;

export const systemCallApi = createSystemCallApi(useApiClient);
