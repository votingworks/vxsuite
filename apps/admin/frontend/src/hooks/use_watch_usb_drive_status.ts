import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { AdminStatusUpdate } from '@votingworks/admin-backend';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { useStatusUpdates } from '@votingworks/ui';
import { useCallback } from 'react';
import { getUsbDriveStatus, useApiClient } from '../api.js';

/**
 * Long-polls the backend for status changes, keeping the `getUsbDriveStatus`
 * query current, and returns that query's result. Mount once per app root.
 */
export function useWatchUsbDriveStatus(): UseQueryResult<UsbDriveStatus> {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const getStatusUpdate = useCallback(
    (input: { since?: number }) => apiClient.getStatusUpdate(input),
    [apiClient]
  );
  const onUpdate = useCallback(
    (update: AdminStatusUpdate) =>
      queryClient.setQueryData(
        getUsbDriveStatus.queryKey(),
        update.statuses.usbDrive
      ),
    [queryClient]
  );
  useStatusUpdates({ getStatusUpdate, onUpdate });
  return getUsbDriveStatus.useQuery();
}
