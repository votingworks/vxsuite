import { LanguageCode } from '@votingworks/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { renderHook, waitFor } from '../../test/react_testing_library';
import { createUiStringsApi, UiStringsApiClient } from './ui_strings_api';

const queryClient = new QueryClient();
function QueryWrapper(props: { children: React.ReactNode }) {
  const { children } = props;

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockApiClient: jest.Mocked<UiStringsApiClient> = {
  getAudioClips: jest.fn(),
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
      LanguageCode.CHINESE_TRADITIONAL,
      LanguageCode.SPANISH,
    ]);
    await api.onMachineConfigurationChange(queryClient);
  });

  await waitFor(() => expect(result.current.isLoading).toEqual(false));
  expect(result.current.data).toEqual([
    LanguageCode.CHINESE_TRADITIONAL,
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

test('getUiStrings', async () => {
  const languageCode = LanguageCode.SPANISH;

  // Simulate initial machine state:
  mockApiClient.getUiStrings.mockResolvedValueOnce(null);

  const { result } = renderHook(() => api.getUiStrings.useQuery(languageCode), {
    wrapper: QueryWrapper,
  });

  await waitFor(() => expect(result.current.isSuccess).toEqual(true));
  expect(result.current.data).toEqual(null);
  expect(mockApiClient.getUiStrings).toHaveBeenLastCalledWith({ languageCode });

  // Simulate configuring an election:
  await act(async () => {
    mockApiClient.getUiStrings.mockResolvedValueOnce({ foo: 'bar_es' });
    await api.onMachineConfigurationChange(queryClient);
  });

  await waitFor(() => expect(result.current.isLoading).toEqual(false));
  expect(result.current.data).toEqual({ foo: 'bar_es' });
  expect(mockApiClient.getUiStrings).toHaveBeenLastCalledWith({ languageCode });

  // Simulate unconfiguring an election:
  await act(async () => {
    mockApiClient.getUiStrings.mockResolvedValueOnce(null);
    await api.onMachineConfigurationChange(queryClient);
  });

  await waitFor(() => expect(result.current.isLoading).toEqual(false));
  expect(result.current.data).toEqual(null);
  expect(mockApiClient.getUiStrings).toHaveBeenLastCalledWith({ languageCode });
});
