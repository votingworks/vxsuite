import { afterEach, beforeEach, expect, it, Mocked, vi } from 'vitest';
import {
  AppBase,
  LanguageControls,
  useCurrentLanguage,
  VoterSettingsManagerContext,
  useAudioEnabled,
} from '@votingworks/ui';
import { DefaultTheme, ThemeContext } from 'styled-components';
import React from 'react';
import { mockUseAudioControls } from '@votingworks/test-utils';
import { useSessionSettingsManager } from './use_session_settings_manager';
import { renderHook, act } from '../../test/react_testing_library';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

let apiMock: ApiMock;
const mockAudioControls = mockUseAudioControls(vi.fn);
const mockLanguageControls: Mocked<LanguageControls> = {
  reset: vi.fn(),
  setLanguage: vi.fn(),
};
const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
const mockUseCurrentLanguage = vi.mocked(useCurrentLanguage);

vi.mock('@votingworks/ui', async () => ({
  ...(await vi.importActual('@votingworks/ui')),
  useAudioControls: () => mockAudioControls,
  useLanguageControls: () => mockLanguageControls,
  useAudioEnabled: vi.fn(),
  useCurrentLanguage: vi.fn(),
}));

const DEFAULT_THEME = {
  colorMode: 'contrastMedium',
  sizeMode: 'touchMedium',
  isVisualModeDisabled: false,
} as const satisfies Partial<DefaultTheme>;

function TestHookWrapper(props: { children: React.ReactNode }) {
  return (
    <AppBase
      {...props}
      defaultColorMode={DEFAULT_THEME.colorMode}
      defaultSizeMode={DEFAULT_THEME.sizeMode}
      defaultIsVisualModeDisabled={DEFAULT_THEME.isVisualModeDisabled}
      disableFontsForTests
    />
  );
}

function useTestHook() {
  const [mockIsAudioEnabled, setMockIsAudioEnabled] = React.useState(true);
  const [mockLanguage, setMockLanguage] = React.useState('en');
  mockUseAudioEnabled.mockReturnValue(mockIsAudioEnabled);
  mockUseCurrentLanguage.mockReturnValue(mockLanguage);

  const theme = React.useContext(ThemeContext);
  const voterSettingsManager = React.useContext(VoterSettingsManagerContext);
  const voterSettingsControls = useSessionSettingsManager();

  return {
    setMockIsAudioEnabled,
    setMockLanguage,
    theme,
    voterSettingsManager,
    ...voterSettingsControls,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

it('Reset voter settings when resetVoterSettings is called', () => {
  const { result } = renderHook(() => useTestHook(), {
    wrapper: TestHookWrapper,
  });

  expect(mockAudioControls.reset).not.toHaveBeenCalled();
  expect(mockLanguageControls.reset).not.toHaveBeenCalled();
  expect(mockLanguageControls.setLanguage).not.toHaveBeenCalled();

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

  // Reset voter settings
  act(() => {
    result.current.startNewSession();
  });

  // Validate settings were reset
  expect(mockAudioControls.reset).toHaveBeenCalledTimes(1);
  expect(mockLanguageControls.reset).toHaveBeenCalledTimes(1);
  expect(mockLanguageControls.setLanguage).not.toHaveBeenCalled();
  expect(result.current.theme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>(DEFAULT_THEME)
  );
});

it('First cache/clear voter settings and then restore', () => {
  const { result } = renderHook(() => useTestHook(), {
    wrapper: TestHookWrapper,
  });

  // Simulate changing session settings as voter:
  act(() => {
    result.current.setMockIsAudioEnabled(false);
    result.current.setMockLanguage('es-US');
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

  // Cache and reset voter settings
  act(() => {
    result.current.pauseSession();
  });

  // Validate settings were reset
  expect(mockAudioControls.reset).toHaveBeenCalledTimes(1);
  expect(mockAudioControls.setIsEnabled).not.toHaveBeenCalled();
  expect(mockLanguageControls.reset).toHaveBeenCalledTimes(1);
  expect(mockLanguageControls.setLanguage).not.toHaveBeenCalled();
  expect(result.current.theme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>(DEFAULT_THEME)
  );

  // Restore voter settings
  act(() => {
    result.current.resumeSession();
  });

  // Validate settings were restored
  expect(result.current.theme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'touchExtraLarge',
      isVisualModeDisabled: true,
    })
  );
  expect(mockAudioControls.setIsEnabled).toHaveBeenCalledTimes(1);
  expect(mockAudioControls.setIsEnabled).toHaveBeenCalledWith(false);
  expect(mockLanguageControls.setLanguage).toHaveBeenCalledTimes(1);
  expect(mockLanguageControls.setLanguage).toHaveBeenCalledWith('es-US');
});
