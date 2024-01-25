import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Optional } from '@votingworks/basics';
import { LanguageCode } from '@votingworks/types';
import type { SystemCallApi as SystemCallApiClient } from '@votingworks/backend';
import {
  UiStringsApiClient,
  UiStringsReactQueryApi,
  createUiStringsApi,
} from '../src/hooks/ui_strings_api';
import {
  LanguageContextInterface,
  useLanguageContext,
} from '../src/ui_strings/language_context';
import {
  UiStringsAudioContextInterface,
  useAudioContext,
} from '../src/ui_strings/audio_context';
import { UiStringsContextProvider } from '../src/ui_strings/ui_strings_context';
import { render, RenderResult } from './react_testing_library';
import { QUERY_CLIENT_DEFAULT_OPTIONS } from '../src';
import {
  SystemCallReactQueryApi,
  createSystemCallApi,
  SystemCallContextProvider,
} from '../src/system_call_api';

type ApiClient = UiStringsApiClient & SystemCallApiClient;

export interface TestContext {
  getAudioContext: () => Optional<UiStringsAudioContextInterface>;
  getLanguageContext: () => Optional<LanguageContextInterface>;
  mockApiClient: jest.Mocked<ApiClient>;
  render: (ui: React.ReactElement) => RenderResult;
}

export function newTestContext(
  options: {
    skipUiStringsApi?: boolean;
    uiStringsApiOptions?: {
      disabled?: boolean;
      noAudio?: boolean;
    };
  } = {}
): TestContext {
  let currentLanguageContext: Optional<LanguageContextInterface>;
  let currentAudioContext: Optional<UiStringsAudioContextInterface>;

  function ContextConsumer() {
    currentAudioContext = useAudioContext();
    currentLanguageContext = useLanguageContext();
    return null;
  }

  const mockUiStringsApiClient: jest.Mocked<UiStringsApiClient> = {
    getAudioClips: jest.fn(),
    getAvailableLanguages: jest.fn(),
    getUiStringAudioIds: jest.fn(),
    getUiStrings: jest.fn(),
  };

  // Set up default mock for `getAvailableLanguages` to unblock initial render.
  mockUiStringsApiClient.getAvailableLanguages.mockResolvedValue([
    LanguageCode.ENGLISH,
  ]);

  // Set up remaining initial mocks for convenience:
  mockUiStringsApiClient.getUiStrings.mockResolvedValue(null);
  mockUiStringsApiClient.getUiStringAudioIds.mockResolvedValue(null);
  mockUiStringsApiClient.getAudioClips.mockResolvedValue([]);

  const mockSystemCallApiClient: jest.Mocked<SystemCallApiClient> = {
    reboot: jest.fn(),
    rebootToBios: jest.fn(),
    powerDown: jest.fn(),
    setClock: jest.fn(),
    exportLogsToUsb: jest.fn(),
    getBatteryInfo: jest.fn(),
  };

  const mockApiClient = {
    ...mockUiStringsApiClient,
    ...mockSystemCallApiClient,
  } as const;

  const mockReactQueryUiStringsApi: UiStringsReactQueryApi = createUiStringsApi(
    () => mockApiClient
  );

  const mockReactQuerySystemCallApi: SystemCallReactQueryApi =
    createSystemCallApi(() => mockApiClient);

  const queryClient = new QueryClient({
    defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS,
  });

  function Wrapper(props: { children?: React.ReactNode }) {
    const { children } = props;

    if (options.skipUiStringsApi) {
      return (
        <QueryClientProvider client={queryClient}>
          <SystemCallContextProvider api={mockReactQuerySystemCallApi}>
            {children}
          </SystemCallContextProvider>
        </QueryClientProvider>
      );
    }

    return (
      <QueryClientProvider client={queryClient}>
        <SystemCallContextProvider api={mockReactQuerySystemCallApi}>
          <UiStringsContextProvider
            api={mockReactQueryUiStringsApi}
            disabled={options.uiStringsApiOptions?.disabled}
            noAudio={options.uiStringsApiOptions?.noAudio}
          >
            <ContextConsumer />
            {children}
          </UiStringsContextProvider>
        </SystemCallContextProvider>
      </QueryClientProvider>
    );
  }

  return {
    mockApiClient,
    render: (ui) => {
      const result = render(<Wrapper>{ui}</Wrapper>);
      return {
        ...result,
        rerender: (newUi) => result.rerender(<Wrapper>{newUi}</Wrapper>),
      };
    },
    getAudioContext: () => currentAudioContext,
    getLanguageContext: () => currentLanguageContext,
  };
}
