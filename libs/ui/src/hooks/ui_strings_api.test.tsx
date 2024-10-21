import { UiStringAudioClips } from '@votingworks/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { TestLanguageCode } from '@votingworks/test-utils';
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
      'zh-Hant',
      'es-US',
    ]);
    await api.onMachineConfigurationChange(queryClient);
  });

  await waitFor(() => expect(result.current.isLoading).toEqual(false));
  expect(result.current.data).toEqual(['zh-Hant', 'es-US']);

  // Simulate unconfiguring an election:
  await act(async () => {
    mockApiClient.getAvailableLanguages.mockResolvedValueOnce([]);
    await api.onMachineConfigurationChange(queryClient);
  });

  await waitFor(() => expect(result.current.isLoading).toEqual(false));
  expect(result.current.data).toEqual([]);
});

test('getUiStrings', async () => {
  const languageCode = 'es-US';

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

test('getAudioClip', async () => {
  const { ENGLISH, SPANISH } = TestLanguageCode;

  // Simulate initial machine state:
  mockApiClient.getAudioClips.mockResolvedValue([]);

  const { result } = renderHook(
    () => ({
      en1: api.getAudioClip.useQuery({ id: 'en1', languageCode: ENGLISH }),
      es1: api.getAudioClip.useQuery({ id: 'es1', languageCode: SPANISH }),
      es2: api.getAudioClip.useQuery({ id: 'es2', languageCode: SPANISH }),
    }),
    { wrapper: QueryWrapper }
  );

  // Expect a batch call for `ENGLISH` clips:
  await waitFor(() => expect(result.current.en1.isSuccess).toEqual(true));
  expect(result.current.en1.data).toBeNull();
  expect(mockApiClient.getAudioClips).toHaveBeenCalledWith({
    audioIds: ['en1'],
    languageCode: ENGLISH,
  });

  // Expect another batch call for `SPANISH` clips:
  await waitFor(() => expect(result.current.es1.isSuccess).toEqual(true));
  expect(result.current.es1.data).toBeNull();
  expect(result.current.es2.data).toBeNull();
  expect(mockApiClient.getAudioClips).toHaveBeenCalledWith({
    audioIds: ['es1', 'es2'],
    languageCode: SPANISH,
  });

  expect(mockApiClient.getAudioClips).toHaveBeenCalledTimes(2);

  // Simulate configuring an election:
  const [clipEnglish1, clipSpanish1, clipSpanish2]: UiStringAudioClips = [
    { dataBase64: 'ABC==', id: 'en1', languageCode: ENGLISH },
    { dataBase64: 'DEF==', id: 'es1', languageCode: SPANISH },
    { dataBase64: 'EDF==', id: 'es2', languageCode: SPANISH },
  ];
  await act(async () => {
    mockApiClient.getAudioClips.mockImplementation((input) => {
      if (input.languageCode === ENGLISH) {
        return Promise.resolve([clipEnglish1]);
      }

      if (input.languageCode === SPANISH) {
        return Promise.resolve([clipSpanish1, clipSpanish2]);
      }

      return Promise.resolve([]);
    });
    await api.onMachineConfigurationChange(queryClient);
  });

  await waitFor(() => expect(result.current.en1.isLoading).toEqual(false));
  expect(result.current.en1.data).toEqual(clipEnglish1);

  await waitFor(() => expect(result.current.es1.isLoading).toEqual(false));
  expect(result.current.es1.data).toEqual(clipSpanish1);
  expect(result.current.es2.data).toEqual(clipSpanish2);

  // Simulate unconfiguring an election:
  await act(async () => {
    mockApiClient.getAudioClips.mockResolvedValue([]);
    await api.onMachineConfigurationChange(queryClient);
  });

  await waitFor(() => expect(result.current.en1.isLoading).toEqual(false));
  await waitFor(() => expect(result.current.es1.isLoading).toEqual(false));
  expect(result.current.en1.data).toEqual(null);
  expect(result.current.es1.data).toEqual(null);
  expect(result.current.es2.data).toEqual(null);
});

test('getAudioIds', async () => {
  const languageCode = 'es-US';

  // Simulate initial machine state:
  mockApiClient.getUiStringAudioIds.mockResolvedValueOnce(null);

  const { result } = renderHook(() => api.getAudioIds.useQuery(languageCode), {
    wrapper: QueryWrapper,
  });

  await waitFor(() => expect(result.current.isSuccess).toEqual(true));
  expect(result.current.data).toEqual(null);
  expect(mockApiClient.getUiStringAudioIds).toHaveBeenCalledWith({
    languageCode,
  });

  // Simulate configuring an election:
  await act(async () => {
    mockApiClient.getUiStringAudioIds.mockResolvedValueOnce({
      foo: ['bar', 'baz'],
    });
    await api.onMachineConfigurationChange(queryClient);
  });

  await waitFor(() => expect(result.current.isLoading).toEqual(false));
  expect(result.current.data).toEqual({ foo: ['bar', 'baz'] });

  // Simulate unconfiguring an election:
  await act(async () => {
    mockApiClient.getUiStringAudioIds.mockResolvedValueOnce(null);
    await api.onMachineConfigurationChange(queryClient);
  });

  await waitFor(() => expect(result.current.isLoading).toEqual(false));
  expect(result.current.data).toEqual(null);
});
