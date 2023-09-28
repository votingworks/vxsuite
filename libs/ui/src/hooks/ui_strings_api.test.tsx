import { LanguageCode } from '@votingworks/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { renderHook, waitFor } from '../../test/react_testing_library';
import { createUiStringsApi } from './ui_strings_api';

const queryClient = new QueryClient();
function QueryWrapper(props: { children: React.ReactNode }) {
  const { children } = props;

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockApiClient = {
  getAudioClipsBase64: jest.fn(),
  getAvailableLanguages: jest.fn(),
  getUiStringAudioIds: jest.fn(),
  getUiStrings: jest.fn(),
} as const;

const api = createUiStringsApi(() => mockApiClient);

test('getAvailableLanguages', async () => {
  // Simulate initial machine state:
  mockApiClient.getAvailableLanguages.mockResolvedValueOnce([]);

  const { result } = renderHook(() => api.getAvailableLanguages.useQuery(), {
    wrapper: QueryWrapper,
  });

  await waitFor(() => expect(result.current.isSuccess).toEqual(true));
  expect(result.current.data).toEqual([]);

  // Simulate configuring an election:
  await act(async () => {
    mockApiClient.getAvailableLanguages.mockResolvedValueOnce([
      LanguageCode.CHINESE,
      LanguageCode.SPANISH,
    ]);
    await api.onMachineConfigurationChange(queryClient);
  });

  await waitFor(() => expect(result.current.isLoading).toEqual(false));
  expect(result.current.data).toEqual([
    LanguageCode.CHINESE,
    LanguageCode.SPANISH,
  ]);

  // Simulate unconfiguring an election:
  await act(async () => {
    mockApiClient.getAvailableLanguages.mockResolvedValueOnce([]);
    await api.onMachineConfigurationChange(queryClient);
  });

  await waitFor(() => expect(result.current.isLoading).toEqual(false));
  expect(result.current.data).toEqual([]);
});
