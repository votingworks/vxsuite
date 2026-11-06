import { expect, test, vi, type Mocked } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AppBase,
  createUiStringsApi,
  QUERY_CLIENT_DEFAULT_OPTIONS,
  UiStringsContextProvider,
  useAudioControls,
  useAudioEnabled,
  useMuteAudio,
  type UiStringsApiClient,
} from '@votingworks/ui';
import {
  mockCardlessVoterUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import type { InsertedSmartCardAuth } from '@votingworks/types';
import { act, renderHook, waitFor } from '../../test/react_testing_library.js';
import { useSessionSettingsManager } from './use_session_settings_manager.js';

const VOTER_AUTH: InsertedSmartCardAuth.AuthStatus = {
  status: 'logged_in',
  user: mockCardlessVoterUser(),
  sessionExpiresAt: mockSessionExpiresAt(),
};

const POLL_WORKER_AUTH: InsertedSmartCardAuth.AuthStatus = {
  status: 'logged_in',
  user: mockPollWorkerUser(),
  cardlessVoterUser: mockCardlessVoterUser(),
  sessionExpiresAt: mockSessionExpiresAt(),
};

function TestHookWrapper(props: { children: React.ReactNode }) {
  const { children } = props;

  const mockApiClient: Mocked<UiStringsApiClient> = {
    getAudioClips: vi.fn().mockResolvedValue([]),
    getAvailableLanguages: vi.fn().mockResolvedValue(['en']),
    getUiStringAudioIds: vi.fn().mockResolvedValue(null),
    getUiStrings: vi.fn().mockResolvedValue(null),
  };
  const [queryClient] = React.useState(
    () => new QueryClient({ defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS })
  );
  const [api] = React.useState(() => createUiStringsApi(() => mockApiClient));

  return (
    <AppBase
      defaultColorMode="contrastMedium"
      defaultSizeMode="touchMedium"
      defaultIsVisualModeDisabled={false}
      disableFontsForTests
    >
      <QueryClientProvider client={queryClient}>
        <UiStringsContextProvider api={api}>
          {children}
        </UiStringsContextProvider>
      </QueryClientProvider>
    </AppBase>
  );
}

function useTestHook() {
  const [authStatus, setAuthStatus] = React.useState(VOTER_AUTH);
  const [isAlarmActive, setIsAlarmActive] = React.useState(false);

  useSessionSettingsManager({ authStatus });
  useMuteAudio(isAlarmActive);

  return {
    audioControls: useAudioControls(),
    isAudioEnabled: useAudioEnabled(),
    setAuthStatus,
    setIsAlarmActive,
  };
}

test('voter audio setting survives an alarm mute and poll worker round trip', async () => {
  const { result } = renderHook(useTestHook, { wrapper: TestHookWrapper });

  await waitFor(() => expect(result.current.isAudioEnabled).toEqual(true));
  act(() => result.current.audioControls.setIsEnabled(true));

  act(() => result.current.setIsAlarmActive(true));
  expect(result.current.isAudioEnabled).toEqual(true);

  act(() => {
    result.current.setAuthStatus(POLL_WORKER_AUTH);
    result.current.setIsAlarmActive(false);
  });
  expect(result.current.isAudioEnabled).toEqual(false);

  act(() => result.current.setAuthStatus(VOTER_AUTH));
  expect(result.current.isAudioEnabled).toEqual(true);
});

test('voter audio setting survives a poll worker visit during an ongoing alarm', async () => {
  const { result } = renderHook(useTestHook, { wrapper: TestHookWrapper });

  await waitFor(() => expect(result.current.isAudioEnabled).toEqual(true));

  act(() => result.current.setIsAlarmActive(true));
  act(() => result.current.setAuthStatus(POLL_WORKER_AUTH));
  act(() => result.current.setAuthStatus(VOTER_AUTH));
  expect(result.current.isAudioEnabled).toEqual(true);

  act(() => result.current.setIsAlarmActive(false));
  expect(result.current.isAudioEnabled).toEqual(true);
});
