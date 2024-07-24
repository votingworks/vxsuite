import { DefaultTheme, ThemeContext } from 'styled-components';
import React from 'react';
import {
  VoterSettingsManagerContext,
  VoterSettingsManagerContextInterface,
  LanguageControls,
  useCurrentLanguage,
  useAudioEnabled,
} from '@votingworks/ui';
import {
  mockCardlessVoterUser,
  mockElectionManagerUser,
  mockSessionExpiresAt,
  mockUseAudioControls,
  mockOf,
} from '@votingworks/test-utils';
import { AudioControls, LanguageCode } from '@votingworks/types';
import { act, render } from '../../test/react_testing_library';
import {
  UseSessionSettingsManagerParams,
  useSessionSettingsManager,
} from './use_session_settings_manager';

const mockAudioControls = mockUseAudioControls();
const mockLanguageControls: jest.Mocked<LanguageControls> = {
  reset: jest.fn(),
  setLanguage: jest.fn(),
};

jest.mock('@votingworks/ui', (): typeof import('@votingworks/ui') => ({
  ...jest.requireActual('@votingworks/ui'),
  ReadOnLoad: jest.fn(),
  useAudioControls: () => mockAudioControls,
  useAudioEnabled: jest.fn(),
  useCurrentLanguage: jest.fn(),
  useLanguageControls: () => mockLanguageControls,
}));

const mockUseAudioEnabled = mockOf(useAudioEnabled);
const mockUseCurrentLanguage = mockOf(useCurrentLanguage);

const DEFAULT_THEME: Partial<DefaultTheme> = {
  colorMode: 'contrastMedium',
  sizeMode: 'touchMedium',
  isVisualModeDisabled: false,
};
const { CHINESE_SIMPLIFIED, SPANISH } = LanguageCode;

let currentTheme: DefaultTheme;
let voterSettingsManager: VoterSettingsManagerContextInterface;

function TestHookWrapper(props: UseSessionSettingsManagerParams): null {
  currentTheme = React.useContext(ThemeContext);
  voterSettingsManager = React.useContext(VoterSettingsManagerContext);

  useSessionSettingsManager(props);

  return null;
}

const ALLOWED_AUDIO_CONTROLS: ReadonlySet<keyof AudioControls> = new Set<
  keyof AudioControls
>(['reset', 'setIsEnabled']);

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
  const { rerender } = render(
    <TestHookWrapper
      authStatus={{
        status: 'logged_in',
        user: mockCardlessVoterUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      }}
    />,
    { vxTheme: DEFAULT_THEME }
  );

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastMedium',
      sizeMode: 'touchMedium',
    })
  );
  expect(mockLanguageControls.reset).not.toHaveBeenCalled();
  expect(mockLanguageControls.setLanguage).not.toHaveBeenCalled();
  expect(mockAudioControls.reset).not.toHaveBeenCalled();
  expect(mockAudioControls.setIsEnabled).not.toHaveBeenCalled();

  // Simulate changing session settings as voter:
  act(() => {
    voterSettingsManager.setColorMode('contrastLow');
    voterSettingsManager.setSizeMode('touchExtraLarge');
    voterSettingsManager.setIsVisualModeDisabled(true);
  });
  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'touchExtraLarge',
      isVisualModeDisabled: true,
    })
  );
  mockUseCurrentLanguage.mockReturnValue(SPANISH);
  mockUseAudioEnabled.mockReturnValue(true);

  // Should reset session settings on Election Manager login:
  rerender(
    <TestHookWrapper
      authStatus={{
        status: 'logged_in',
        user: mockElectionManagerUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      }}
    />
  );
  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>(DEFAULT_THEME)
  );
  expect(mockLanguageControls.reset).toHaveBeenCalled();
  expect(mockAudioControls.reset).not.toHaveBeenCalled();
  expect(mockLanguageControls.setLanguage).not.toHaveBeenCalled();
  expect(mockAudioControls.setIsEnabled).toHaveBeenLastCalledWith(false);

  // Simulate changing session settings as Election Manager:
  act(() => {
    voterSettingsManager.setColorMode('contrastHighDark');
    voterSettingsManager.setSizeMode('touchSmall');
  });
  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastHighDark',
      sizeMode: 'touchSmall',
    })
  );
  mockUseCurrentLanguage.mockReturnValue(CHINESE_SIMPLIFIED);

  // Should return to voter settings on return to voter session:
  rerender(
    <TestHookWrapper
      authStatus={{
        status: 'logged_in',
        user: mockCardlessVoterUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      }}
    />
  );
  expect(currentTheme).toEqual(
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

test('Resets theme to default if returning to a new voter session', () => {
  const { rerender } = render(
    <TestHookWrapper
      authStatus={{
        status: 'logged_in',
        user: mockCardlessVoterUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      }}
    />,
    { vxTheme: DEFAULT_THEME }
  );

  // Simulate changing session settings as voter:
  act(() => {
    voterSettingsManager.setColorMode('contrastLow');
    voterSettingsManager.setSizeMode('touchExtraLarge');
    voterSettingsManager.setIsVisualModeDisabled(true);
  });
  mockUseCurrentLanguage.mockReturnValue(SPANISH);
  mockUseAudioEnabled.mockReturnValue(false);

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'touchExtraLarge',
      isVisualModeDisabled: true,
    })
  );

  // Simulate logging in ang changing voter settings as Election Manager:
  rerender(
    <TestHookWrapper
      authStatus={{
        status: 'logged_in',
        user: mockElectionManagerUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      }}
    />
  );
  mockUseCurrentLanguage.mockReturnValue(CHINESE_SIMPLIFIED);
  act(() => {
    voterSettingsManager.setColorMode('contrastHighDark');
    voterSettingsManager.setSizeMode('touchSmall');
  });
  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastHighDark',
      sizeMode: 'touchSmall',
      isVisualModeDisabled: false,
    })
  );

  mockLanguageControls.reset.mockReset();
  mockLanguageControls.setLanguage.mockReset();
  mockAudioControls.reset.mockReset();
  mockAudioControls.setIsEnabled.mockReset();

  // Should reset to default if voter session has been reset:
  rerender(
    <TestHookWrapper
      authStatus={{
        status: 'logged_in',
        user: {
          ...mockCardlessVoterUser(),
          sessionId: 'new_session',
        },
        sessionExpiresAt: mockSessionExpiresAt(),
      }}
    />
  );
  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>(DEFAULT_THEME)
  );
  expect(mockLanguageControls.reset).toHaveBeenCalled();
  expect(mockLanguageControls.setLanguage).not.toHaveBeenCalled();
  expect(mockAudioControls.reset).toHaveBeenCalled();
  expect(mockAudioControls.setIsEnabled).not.toHaveBeenCalled();
});
