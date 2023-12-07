import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageCode } from '@votingworks/types';
import { act } from 'react-dom/test-utils';
import { createUiStringsApi } from './ui_strings_api';
import { UiStringsContextProvider, useCurrentLanguage } from '..';
import {
  DEFAULT_LANGUAGE_CODE,
  LanguageContextInterface,
  useLanguageContext,
} from '../ui_strings/language_context';

test('returns default language when rendered without context', () => {
  const { result } = renderHook(() => useCurrentLanguage());

  expect(result.current).toEqual(DEFAULT_LANGUAGE_CODE);
});

test('returns current language when rendered within context', async () => {
  const api = createUiStringsApi(() => ({
    getAudioClips: jest.fn(),
    getAvailableLanguages: jest.fn().mockResolvedValue([]),
    getUiStringAudioIds: jest.fn(),
    getUiStrings: jest.fn().mockResolvedValue(null),
  }));

  function TestHookWrapper(props: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={new QueryClient()}>
        <UiStringsContextProvider {...props} api={api} noAudio />
      </QueryClientProvider>
    );
  }

  let setLanguage: LanguageContextInterface['setLanguage'];
  const { result } = renderHook(
    () => {
      setLanguage = useLanguageContext()!.setLanguage;
      return useCurrentLanguage();
    },
    { wrapper: TestHookWrapper }
  );

  await waitFor(() => expect(result.current).toEqual(DEFAULT_LANGUAGE_CODE), {
    timeout: 100,
  });

  act(() => setLanguage(LanguageCode.SPANISH));
  await waitFor(() => expect(result.current).toEqual(LanguageCode.SPANISH), {
    timeout: 100,
  });
});
