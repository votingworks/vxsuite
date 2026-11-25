import { expect, test, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { AdminStatusUpdate } from '@votingworks/admin-backend';
import { deferred } from '@votingworks/basics';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { type ApiClient, ApiClientContext, createQueryClient } from '../api.js';
import { useWatchUsbDriveStatus } from './use_watch_usb_drive_status.js';

test('keeps the USB drive status query current from status updates', async () => {
  const getStatusUpdate = vi.fn(({ since }: { since?: number }) =>
    since === undefined
      ? Promise.resolve<AdminStatusUpdate>({
          revision: 1,
          statuses: { usbDrive: mockUsbDriveStatus('mounted') },
        })
      : deferred<AdminStatusUpdate>().promise
  );
  const apiClient = {
    getStatusUpdate,
    getUsbDriveStatus: () => deferred().promise,
  } as unknown as ApiClient;
  const queryClient = createQueryClient();

  const { result } = renderHook(() => useWatchUsbDriveStatus(), {
    wrapper: ({ children }) => (
      <ApiClientContext.Provider value={apiClient}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </ApiClientContext.Provider>
    ),
  });

  await waitFor(() =>
    expect(result.current.data).toEqual(mockUsbDriveStatus('mounted'))
  );
  expect(getStatusUpdate).toHaveBeenLastCalledWith({ since: 1 });
});
