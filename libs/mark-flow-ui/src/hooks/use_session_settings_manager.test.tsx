import { DefaultTheme, ThemeContext } from 'styled-components';
import React from 'react';
import {
  VoterSettingsManagerContext,
  LanguageControls,
  useCurrentLanguage,
  useAudioEnabled,
  AppBase,
} from '@votingworks/ui';
import {
  mockCardlessVoterUser,
  mockElectionManagerUser,
  mockSessionExpiresAt,
  mockUseAudioControls,
  mockOf,
} from '@votingworks/test-utils';
import {
  AudioControls,
  InsertedSmartCardAuth,
  LanguageCode,
} from '@votingworks/types';
import { act, renderHook } from '../../test/react_testing_library';
import { useSessionSettingsManager } from './use_session_settings_manager';

const mockAudioControls = mockUseAudioControls();
const mockLanguageControls: jest.Mocked<LanguageControls> = {
  reset: jest.fn(),
  setLanguage: jest.fn(),
};

jest.mock('@votingworks/ui', (): typeof import('@votingworks/ui') => ({
  ...jest.requireActual('@votingworks/ui'),
  useAudioControls: () => mockAudioControls,
  useAudioEnabled: jest.fn(),
  useCurrentLanguage: jest.fn(),
  useLanguageControls: () => mockLanguageControls,
}));

const mockUseAudioEnabled = mockOf(useAudioEnabled);
const mockUseCurrentLanguage = mockOf(useCurrentLanguage);

const DEFAULT_THEME = {
  colorMode: 'contrastMedium',
  sizeMode: 'touchMedium',
  isVisualModeDisabled: false,
} as const satisfies Partial<DefaultTheme>;
const { CHINESE_SIMPLIFIED, ENGLISH, SPANISH } = LanguageCode;

const VOTER_AUTH: InsertedSmartCardAuth.AuthStatus = {
  status: 'logged_in',
  user: mockCardlessVoterUser(),
  sessionExpiresAt: mockSessionExpiresAt(),
};

const ELECTION_MANAGER_AUTH: InsertedSmartCardAuth.AuthStatus = {
  status: 'logged_in',
  user: mockElectionManagerUser(),
  cardlessVoterUser: mockCardlessVoterUser(),
  sessionExpiresAt: mockSessionExpiresAt(),
};

function TestHookWrapper(props: { children: React.ReactNode }) {
  return (
    <AppBase
      {...props}
      defaultColorMode={DEFAULT_THEME.colorMode}
      defaultSizeMode={DEFAULT_THEME.sizeMode}
      defaultIsVisualModeDisabled={DEFAULT_THEME.isVisualModeDisabled ?? false}
      disableFontsForTests
    />
  );
}

function useTestHook() {
  const [authStatus, setMockAuth] = React.useState(VOTER_AUTH);
  const [mockLanguage, setMockLanguage] = React.useState(ENGLISH);
  const [mockAudioEnabled, setMockAudioEnabled] = React.useState(true);

  mockUseCurrentLanguage.mockReturnValue(mockLanguage);
  mockUseAudioEnabled.mockReturnValue(mockAudioEnabled);

  const theme = React.useContext(ThemeContext);
  const voterSettingsManager = React.useContext(VoterSettingsManagerContext);

  const { onSessionEnd } = useSessionSettingsManager({ authStatus });

  return {
    theme,
    onSessionEnd,
    setMockAudioEnabled,
    setMockAuth,
    setMockLanguage,
    voterSettingsManager,
  };
}

const ALLOWED_AUDIO_CONTROLS: ReadonlySet<keyof AudioControls> = new Set<
  keyof AudioControls
>(['setIsEnabled']);

afterEach(() => {
  // Catch any unexpected audio control usage:
  for (const method of Object.keys(mockAudioControls) as Array<
    keyof AudioControls
  >) {
    if (ALLOWED_AUDIO_CONTROLS.has(method)) {
      continue;
    }

    expect(mockAudioControls[method]).not.toHaveBeenCalled();
  }
});

test('Resets settings when election official logs in', () => {
  const { result } = renderHook(useTestHook, { wrapper: TestHookWrapper });

  expect(result.current.theme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>(DEFAULT_THEME)
  );
  expect(mockLanguageControls.reset).not.toHaveBeenCalled();
  expect(mockLanguageControls.setLanguage).not.toHaveBeenCalled();
  expect(mockAudioControls.reset).not.toHaveBeenCalled();
  expect(mockAudioControls.setIsEnabled).not.toHaveBeenCalled();

  // Simulate changing session settings as voter:
  act(() => {
    result.current.voterSettingsManager.setColorMode('contrastLow');
    result.current.voterSettingsManager.setSizeMode('touchExtraLarge');
    result.current.voterSettingsManager.setIsVisualModeDisabled(true);
  });
  expect(result.current.theme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'touchExtraLarge',
      isVisualModeDisabled: true,
    })
  );

  act(() => {
    result.current.setMockLanguage(SPANISH);
    result.current.setMockAudioEnabled(true);
  });

  // Should reset session settings on Election Manager login:
  act(() => result.current.setMockAuth(ELECTION_MANAGER_AUTH));

  expect(result.current.theme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>(DEFAULT_THEME)
  );
  expect(mockLanguageControls.reset).toHaveBeenCalled();
  expect(mockLanguageControls.setLanguage).not.toHaveBeenCalled();
  expect(mockAudioControls.setIsEnabled).toHaveBeenLastCalledWith(false);

  // Simulate changing session settings as Election Manager:
  act(() => {
    result.current.voterSettingsManager.setColorMode('contrastHighDark');
    result.current.voterSettingsManager.setSizeMode('touchSmall');
  });
  expect(result.current.theme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastHighDark',
      sizeMode: 'touchSmall',
    })
  );
  act(() => result.current.setMockLanguage(CHINESE_SIMPLIFIED));

  // Should return to voter settings on return to voter session:
  act(() => result.current.setMockAuth(VOTER_AUTH));

  expect(result.current.theme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'touchExtraLarge',
      isVisualModeDisabled: true,
    })
  );
  expect(mockLanguageControls.setLanguage).toHaveBeenCalledWith(SPANISH);
  expect(mockAudioControls.setIsEnabled).toHaveBeenLastCalledWith(true);
  expect(mockAudioControls.reset).not.toHaveBeenCalled();
});

test('Clears stored voter settings when session is ended', () => {
  const { result } = renderHook(useTestHook, { wrapper: TestHookWrapper });

  // Simulate changing session settings as voter:
  act(() => {
    result.current.voterSettingsManager.setColorMode('contrastLow');
    result.current.voterSettingsManager.setSizeMode('touchExtraLarge');
    result.current.voterSettingsManager.setIsVisualModeDisabled(true);
    result.current.setMockLanguage(SPANISH);
    result.current.setMockAudioEnabled(false);
  });

  expect(result.current.theme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'touchExtraLarge',
      isVisualModeDisabled: true,
    })
  );

  // Simulate logging in as Election Manager and ending the voter session:
  act(() => {
    result.current.setMockAuth(ELECTION_MANAGER_AUTH);
    result.current.onSessionEnd();
  });

  mockLanguageControls.reset.mockReset();
  mockLanguageControls.setLanguage.mockReset();
  mockAudioControls.reset.mockReset();
  mockAudioControls.setIsEnabled.mockReset();

  // Logging back in as a voter after session end should be a no-op:
  act(() => result.current.setMockAuth(VOTER_AUTH));

  expect(result.current.theme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>(DEFAULT_THEME)
  );
  expect(mockLanguageControls.reset).not.toHaveBeenCalled();
  expect(mockLanguageControls.setLanguage).not.toHaveBeenCalled();
  expect(mockAudioControls.reset).not.toHaveBeenCalled();
  expect(mockAudioControls.setIsEnabled).not.toHaveBeenCalled();
});
