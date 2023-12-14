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
} from '@votingworks/ui';

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

export const generateLiveCheckQrCodeValue = {
  queryKey(): QueryKey {
    return ['generateLiveCheckQrCodeValue'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.generateLiveCheckQrCodeValue(),
      { cacheTime: 0 } // Always generate a fresh QR code value
    );
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
        await queryClient.invalidateQueries(getConfig.queryKey());
        await queryClient.invalidateQueries(getPollsInfo.queryKey());
        await uiStringsApi.onMachineConfigurationChange(queryClient);

        // If doesUsbDriveRequireCastVoteRecordSync was true, unconfiguring resets it back to false
        await queryClient.invalidateQueries(getUsbDriveStatus.queryKey());
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

export const setIsUltrasonicDisabled = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setIsUltrasonicDisabled, {
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

export const transitionPolls = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.transitionPolls, {
      async onSuccess() {
        await queryClient.invalidateQueries(getPollsInfo.queryKey());
      },
    });
  },
} as const;

export const recordBallotBagReplaced = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.recordBallotBagReplaced, {
      async onSuccess() {
        await queryClient.invalidateQueries(getConfig.queryKey());
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

export const getScannerResultsByParty = {
  queryKey(): QueryKey {
    return ['getScannerResultsByParty'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.getScannerResultsByParty()
    );
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

export const scanBallot = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.scanBallot);
  },
} as const;

export const acceptBallot = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.acceptBallot, {
      async onSuccess() {
        await queryClient.invalidateQueries(
          getScannerResultsByParty.queryKey()
        );
      },
    });
  },
} as const;

export const returnBallot = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.returnBallot);
  },
} as const;

export const supportsUltrasonic = {
  queryKey(): QueryKey {
    return ['supportsUltrasonic'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.supportsUltrasonic());
  },
} as const;

export const exportLogsToUsb = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportLogsToUsb);
  },
} as const;
