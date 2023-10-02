import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ok } from '@votingworks/basics';
import React from 'react';
import { renderHook, waitFor } from '../test/react_testing_library';
import {
  ApiClient,
  ApiClientContext,
  configureFromBallotPackageOnUsbDrive,
  createApiClient,
  unconfigureElection,
  uiStringsApi,
} from './api';

const queryClient = new QueryClient();
const mockBackendApi: ApiClient = {
  ...createApiClient(),
  configureFromBallotPackageOnUsbDrive: jest.fn(),
  unconfigureElection: jest.fn(),
};

function QueryWrapper(props: { children: React.ReactNode }) {
  const { children } = props;

  return (
    <ApiClientContext.Provider value={mockBackendApi}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiClientContext.Provider>
  );
}

const mockOnConfigurationChange = jest.spyOn(
  uiStringsApi,
  'onMachineConfigurationChange'
);

afterAll(() => {
  jest.restoreAllMocks();
});

test('configureFromBallotPackageOnUsbDrive', async () => {
  jest
    .mocked(mockBackendApi)
    .configureFromBallotPackageOnUsbDrive.mockResolvedValueOnce(ok());

  const { result } = renderHook(
    () => configureFromBallotPackageOnUsbDrive.useMutation(),
    { wrapper: QueryWrapper }
  );

  expect(mockOnConfigurationChange).not.toHaveBeenCalled();

  result.current.mutate();
  await waitFor(() => expect(result.current.isSuccess).toEqual(true));

  expect(mockOnConfigurationChange).toHaveBeenCalled();
});

test('unconfigureElection', async () => {
  jest.mocked(mockBackendApi).unconfigureElection.mockResolvedValue();

  const { result } = renderHook(() => unconfigureElection.useMutation(), {
    wrapper: QueryWrapper,
  });

  expect(mockOnConfigurationChange).not.toHaveBeenCalled();

  result.current.mutate({});
  await waitFor(() => expect(result.current.isSuccess).toEqual(true));

  expect(mockOnConfigurationChange).toHaveBeenCalled();
});
