import { DefaultTheme, ThemeContext } from 'styled-components';
import React from 'react';
import {
  VoterSettingsManagerContext,
  VoterSettingsManagerContextInterface,
  LanguageControls,
  useCurrentLanguage,
} from '@votingworks/ui';
import {
  mockCardlessVoterUser,
  mockElectionManagerUser,
  mockSessionExpiresAt,
  fakeUseAudioControls,
  mockOf,
} from '@votingworks/test-utils';
import { AudioControls, LanguageCode, VotesDict } from '@votingworks/types';
import { act, render } from '../../test/react_testing_library';
import {
  UseSessionSettingsManagerParams,
  useSessionSettingsManager,
} from './use_session_settings_manager';

const mockAudioControls = fakeUseAudioControls();
const mockLanguageControls: jest.Mocked<LanguageControls> = {
  reset: jest.fn(),
  setLanguage: jest.fn(),
};

jest.mock('@votingworks/ui', (): typeof import('@votingworks/ui') => ({
  ...jest.requireActual('@votingworks/ui'),
  ReadOnLoad: jest.fn(),
  useAudioControls: () => mockAudioControls,
  useCurrentLanguage: jest.fn(),
  useLanguageControls: () => mockLanguageControls,
}));

const mockUseCurrentLanguage = mockOf(useCurrentLanguage);

const DEFAULT_THEME: Partial<DefaultTheme> = {
  colorMode: 'contrastMedium',
  sizeMode: 'touchMedium',
};
const ACTIVE_VOTING_SESSION_VOTES: VotesDict = {};
const NEW_VOTING_SESSION_VOTES = undefined;
const { CHINESE_SIMPLIFIED, SPANISH } = LanguageCode;

let currentTheme: DefaultTheme;
let voterSettingsManager: VoterSettingsManagerContextInterface;

function TestHookWrapper(props: UseSessionSettingsManagerParams): null {
  currentTheme = React.useContext(ThemeContext);
  voterSettingsManager = React.useContext(VoterSettingsManagerContext);

  useSessionSettingsManager(props);

  return null;
}

afterEach(() => {
  // Catch any unexpected audio control usage:
  for (const method of Object.keys(mockAudioControls) as Array<
    keyof AudioControls
  >) {
    if (method === 'reset') {
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
      votes={ACTIVE_VOTING_SESSION_VOTES}
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

  // Simulate changing session settings as voter:
  act(() => {
    voterSettingsManager.setColorMode('contrastLow');
    voterSettingsManager.setSizeMode('touchExtraLarge');
  });
  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'touchExtraLarge',
    })
  );
  mockUseCurrentLanguage.mockReturnValue(SPANISH);

  // Should reset session settings on Election Manager login:
  rerender(
    <TestHookWrapper
      authStatus={{
        status: 'logged_in',
        user: mockElectionManagerUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      }}
      votes={ACTIVE_VOTING_SESSION_VOTES}
    />
  );
  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>(DEFAULT_THEME)
  );
  expect(mockLanguageControls.reset).toHaveBeenCalled();
  expect(mockAudioControls.reset).not.toHaveBeenCalled();

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
      votes={ACTIVE_VOTING_SESSION_VOTES}
    />
  );
  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'touchExtraLarge',
    })
  );
  expect(mockLanguageControls.setLanguage).toHaveBeenCalledWith(SPANISH);
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
      votes={ACTIVE_VOTING_SESSION_VOTES}
    />,
    { vxTheme: DEFAULT_THEME }
  );

  // Simulate changing session settings as voter:
  act(() => {
    voterSettingsManager.setColorMode('contrastLow');
    voterSettingsManager.setSizeMode('touchExtraLarge');
  });
  mockUseCurrentLanguage.mockReturnValue(SPANISH);

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'touchExtraLarge',
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
      votes={ACTIVE_VOTING_SESSION_VOTES}
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
    })
  );

  mockLanguageControls.reset.mockReset();
  mockLanguageControls.setLanguage.mockReset();
  mockAudioControls.reset.mockReset();

  // Should reset to default if voter session has been reset:
  rerender(
    <TestHookWrapper
      authStatus={{
        status: 'logged_in',
        user: mockCardlessVoterUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      }}
      votes={NEW_VOTING_SESSION_VOTES}
    />
  );
  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>(DEFAULT_THEME)
  );
  expect(mockLanguageControls.reset).toHaveBeenCalled();
  expect(mockLanguageControls.setLanguage).not.toHaveBeenCalled();
  expect(mockAudioControls.reset).toHaveBeenCalled();
});
