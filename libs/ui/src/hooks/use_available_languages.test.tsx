import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { TestLanguageCode } from '@votingworks/test-utils';
import { createUiStringsApi } from './ui_strings_api';
import { useAvailableLanguages } from './use_available_languages';
import { UiStringsContextProvider } from '../ui_strings';
import { DEFAULT_LANGUAGE_CODE } from '../ui_strings/language_context';
import { renderHook, waitFor } from '../../test/react_testing_library';

const { ENGLISH, SPANISH } = TestLanguageCode;

test('returns available languages from backend', async () => {
  const mockApi = createUiStringsApi(() => ({
    getAudioClips: jest.fn(),
    getAvailableLanguages: jest.fn().mockResolvedValue([ENGLISH, SPANISH]),
    getUiStringAudioIds: jest.fn(),
    getUiStrings: jest.fn().mockResolvedValue(null),
  }));

  function TestHookWrapper(props: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={new QueryClient()}>
        <UiStringsContextProvider {...props} api={mockApi} noAudio />
      </QueryClientProvider>
    );
  }

  const { result } = renderHook(() => useAvailableLanguages(), {
    wrapper: TestHookWrapper,
  });

  await waitFor(() => expect(result.current).toEqual([ENGLISH, SPANISH]));
});

test('returns only default language when rendered without context', () => {
  const { result } = renderHook(() => useAvailableLanguages());

  expect(result.current).toEqual([DEFAULT_LANGUAGE_CODE]);
});
