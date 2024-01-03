import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Optional } from '@votingworks/basics';
import {
  UiStringsApiClient,
  UiStringsReactQueryApi,
  createUiStringsApi,
} from '../../src/hooks/ui_strings_api';
import {
  LanguageContextInterface,
  useLanguageContext,
} from '../../src/ui_strings/language_context';
import {
  UiStringsAudioContextInterface,
  useAudioContext,
} from '../../src/ui_strings/audio_context';
import { UiStringsContextProvider } from '../../src/ui_strings/ui_strings_context';
import { render, RenderResult } from '../react_testing_library';
import { QUERY_CLIENT_DEFAULT_OPTIONS } from '../../src';

export interface UiStringsTestContext {
  getAudioContext: () => Optional<UiStringsAudioContextInterface>;
  getLanguageContext: () => Optional<LanguageContextInterface>;
  mockBackendApi: jest.Mocked<UiStringsApiClient>;
  render: (ui: React.ReactElement) => RenderResult;
}

export function newTestContext(
  options: {
    disabled?: boolean;
    noAudio?: boolean;
  } = {}
): UiStringsTestContext {
  let currentLanguageContext: Optional<LanguageContextInterface>;
  let currentAudioContext: Optional<UiStringsAudioContextInterface>;

  function ContextConsumer() {
    currentLanguageContext = useLanguageContext();
    currentAudioContext = useAudioContext();
    return null;
  }

  const mockBackendApi: jest.Mocked<UiStringsApiClient> = {
    getAudioClips: jest.fn(),
    getAvailableLanguages: jest.fn(),
    getUiStringAudioIds: jest.fn(),
    getUiStrings: jest.fn(),
  };

  const mockUiStringsApi: UiStringsReactQueryApi = createUiStringsApi(
    () => mockBackendApi
  );

  const queryClient = new QueryClient({
    defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS,
  });

  function Wrapper(props: { children?: React.ReactNode }) {
    const { children } = props;

    return (
      <QueryClientProvider client={queryClient}>
        <UiStringsContextProvider
          api={mockUiStringsApi}
          disabled={options.disabled}
          noAudio={options.noAudio}
        >
          <ContextConsumer />
          {children}
        </UiStringsContextProvider>
      </QueryClientProvider>
    );
  }

  return {
    mockBackendApi,
    render: (ui) => render(<Wrapper>{ui}</Wrapper>),
    getAudioContext: () => currentAudioContext,
    getLanguageContext: () => currentLanguageContext,
  };
}
