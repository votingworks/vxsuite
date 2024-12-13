import { afterAll, expect, test, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { ok } from '@votingworks/basics';
import React from 'react';
import { renderHook, waitFor } from '../test/react_testing_library';
import {
  ApiClient,
  configureFromElectionPackageOnUsbDrive,
  createApiClient,
  uiStringsApi,
} from './api';
import { ApiProvider } from './api_provider';

const queryClient = new QueryClient();
const mockBackendApi: ApiClient = {
  ...createApiClient(),
  configureFromElectionPackageOnUsbDrive: vi.fn(),
  unconfigureElection: vi.fn(),
};

function QueryWrapper(props: { children: React.ReactNode }) {
  const { children } = props;

  return (
    <ApiProvider queryClient={queryClient} apiClient={mockBackendApi}>
      {children}
    </ApiProvider>
  );
}

const mockOnConfigurationChange = vi.spyOn(
  uiStringsApi,
  'onMachineConfigurationChange'
);

afterAll(() => {
  vi.restoreAllMocks();
});

test('configureFromElectionPackageOnUsbDrive', async () => {
  vi.mocked(
    mockBackendApi
  ).configureFromElectionPackageOnUsbDrive.mockResolvedValueOnce(ok());

  const { result } = renderHook(
    () => configureFromElectionPackageOnUsbDrive.useMutation(),
    { wrapper: QueryWrapper }
  );

  expect(mockOnConfigurationChange).not.toHaveBeenCalled();

  result.current.mutate();
  await waitFor(() => expect(result.current.isSuccess).toEqual(true));

  expect(mockOnConfigurationChange).toHaveBeenCalled();
});
