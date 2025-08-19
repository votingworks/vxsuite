import { afterEach, beforeEach, expect, it, Mocked, vi } from 'vitest';
import {
  AppBase,
  LanguageControls,
  useCurrentLanguage,
  VoterSettingsManagerContext,
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
const mockUseCurrentLanguage = vi.mocked(useCurrentLanguage);

vi.mock('@votingworks/ui', async () => ({
  ...(await vi.importActual('@votingworks/ui')),
  useCurrentLanguage: vi.fn(),
  useAudioControls: () => mockAudioControls,
  useLanguageControls: () => mockLanguageControls,
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
      defaultIsVisualModeDisabled={DEFAULT_THEME.isVisualModeDisabled ?? false}
      disableFontsForTests
    />
  );
}

function useTestHook() {
  const theme = React.useContext(ThemeContext);
  const voterSettingsManager = React.useContext(VoterSettingsManagerContext);
  const [mockLanguage, setMockLanguage] = React.useState('en');
  const voterSettingsControls = useSessionSettingsManager();
  mockUseCurrentLanguage.mockReturnValue(mockLanguage);

  return {
    theme,
    setMockLanguage,
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

  expect(mockLanguageControls.reset).not.toHaveBeenCalled();
  expect(mockLanguageControls.setLanguage).not.toHaveBeenCalled();

  // Simulate changing session settings as voter:
  act(() => {
    result.current.voterSettingsManager.setColorMode('contrastLow');
    result.current.voterSettingsManager.setSizeMode('touchExtraLarge');
  });
  expect(result.current.theme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'touchExtraLarge',
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
    result.current.voterSettingsManager.setColorMode('contrastLow');
    result.current.voterSettingsManager.setSizeMode('touchExtraLarge');
    result.current.setMockLanguage('es-US');
  });

  expect(result.current.theme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'touchExtraLarge',
    })
  );

  // Cache and reset voter settings
  act(() => {
    result.current.pauseSession();
  });

  // Validate settings were reset
  expect(mockAudioControls.reset).toHaveBeenCalledTimes(1);
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
    })
  );
  expect(mockLanguageControls.setLanguage).toHaveBeenCalledTimes(1);
});
