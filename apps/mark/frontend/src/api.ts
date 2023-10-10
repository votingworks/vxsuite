import type { Api } from '@votingworks/mark-backend';
import React from 'react';
import isEqual from 'lodash.isequal';
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
  UsbDriveStatus as LegacyUsbDriveStatus,
  createUiStringsApi,
} from '@votingworks/ui';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { typedAs } from '@votingworks/basics';

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
        const isUnchanged = isEqual(oldData, newData);
        return isUnchanged ? oldData : newData;
      },
    });
  },
} as const;

// TODO remove this once libs/ui is converted to using libs/usb-drive's UsbDriveStatus
export function legacyUsbDriveStatus(
  usbDrive: UsbDriveStatus
): LegacyUsbDriveStatus {
  return typedAs<Record<UsbDriveStatus['status'], LegacyUsbDriveStatus>>({
    no_drive: 'absent',
    mounted: 'mounted',
    ejected: 'ejected',
    error: 'bad_format',
  })[usbDrive.status];
}

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
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

export const uiStringsApi = createUiStringsApi(useApiClient);

export const configureBallotPackageFromUsb = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(() => apiClient.configureBallotPackageFromUsb(), {
      async onSuccess() {
        await queryClient.invalidateQueries(getElectionDefinition.queryKey());
        await queryClient.invalidateQueries(getSystemSettings.queryKey());
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
        await uiStringsApi.onMachineConfigurationChange(queryClient);
      },
    });
  },
} as const;
