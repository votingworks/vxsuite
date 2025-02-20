import { Mocked, vi } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Optional } from '@votingworks/basics';
import { AudioControls } from '@votingworks/types';
import type { SystemCallApi as SystemCallApiClient } from '@votingworks/backend';
import {
  UiStringsApiClient,
  UiStringsReactQueryApi,
  createUiStringsApi,
} from '../src/hooks/ui_strings_api';
import {
  FrontendLanguageContextInterface,
  useFrontendLanguageContext,
} from '../src/ui_strings/language_context';
import {
  UiStringsAudioContextInterface,
  useAudioContext,
} from '../src/ui_strings/audio_context';
import { UiStringsContextProvider } from '../src/ui_strings/ui_strings_context';
import { RenderResult, render, renderHook } from './react_testing_library';
import {
  QUERY_CLIENT_DEFAULT_OPTIONS,
  VxRenderOptions,
  useAudioControls,
} from '../src';
import {
  SystemCallReactQueryApi,
  createSystemCallApi,
  SystemCallContextProvider,
} from '../src/system_call_api';
import { SignedHashValidationApiClient } from '../src/signed_hash_validation_button';

type ApiClient = UiStringsApiClient &
  SystemCallApiClient &
  SignedHashValidationApiClient;

export interface TestContext {
  getAudioContext: () => Optional<UiStringsAudioContextInterface>;
  getAudioControls: () => Optional<AudioControls>;
  getLanguageContext: () => Optional<FrontendLanguageContextInterface>;
  mockApiClient: Mocked<ApiClient>;
  mockReactQueryUiStringsApi: UiStringsReactQueryApi;
  queryClient: QueryClient;
  render: (
    ui: React.ReactElement,
    renderOptions?: VxRenderOptions
  ) => RenderResult;
  renderHook: typeof renderHook;
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
  let currentLanguageContext: Optional<FrontendLanguageContextInterface>;
  let currentAudioContext: Optional<UiStringsAudioContextInterface>;
  let currentAudioControls: Optional<AudioControls>;

  function ContextConsumer() {
    currentAudioContext = useAudioContext();
    currentAudioControls = useAudioControls();
    currentLanguageContext = useFrontendLanguageContext();
    return null;
  }

  const mockUiStringsApiClient: Mocked<UiStringsApiClient> = {
    getAudioClips: vi.fn(),
    getAvailableLanguages: vi.fn(),
    getUiStringAudioIds: vi.fn(),
    getUiStrings: vi.fn(),
  };

  // Set up default mock for `getAvailableLanguages` to unblock initial render.
  mockUiStringsApiClient.getAvailableLanguages.mockResolvedValue(['en']);

  // Set up remaining initial mocks for convenience:
  mockUiStringsApiClient.getUiStrings.mockResolvedValue(null);
  mockUiStringsApiClient.getUiStringAudioIds.mockResolvedValue(null);
  mockUiStringsApiClient.getAudioClips.mockResolvedValue([]);

  const mockSystemCallApiClient: Mocked<SystemCallApiClient> = {
    rebootToVendorMenu: vi.fn(),
    powerDown: vi.fn(),
    setClock: vi.fn(),
    exportLogsToUsb: vi.fn(),
    getBatteryInfo: vi.fn(),
    getAudioInfo: vi.fn(),
  };

  const mockSignedHashValidationApiClient: Mocked<SignedHashValidationApiClient> =
    {
      generateSignedHashValidationQrCodeValue: vi.fn(),
    };

  const mockApiClient = {
    ...mockUiStringsApiClient,
    ...mockSystemCallApiClient,
    ...mockSignedHashValidationApiClient,
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
    mockReactQueryUiStringsApi,
    queryClient,
    render: (ui, renderOptions) => {
      const result = render(<Wrapper>{ui}</Wrapper>, renderOptions);
      return {
        ...result,
        rerender: (newUi) => result.rerender(<Wrapper>{newUi}</Wrapper>),
      };
    },
    renderHook: (renderer) => renderHook(renderer, { wrapper: Wrapper }),
    getAudioContext: () => currentAudioContext,
    getAudioControls: () => currentAudioControls,
    getLanguageContext: () => currentLanguageContext,
  };
}
