import { DefaultTheme, ThemeContext } from 'styled-components';
import React from 'react';
import {
  DisplaySettingsManagerContext,
  DisplaySettingsManagerContextInterface,
} from '@votingworks/ui';
import {
  fakeCardlessVoterUser,
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
} from '@votingworks/test-utils';
import { VotesDict } from '@votingworks/types';
import { act, render } from '../../test/react_testing_library';
import {
  UseDisplaySettingsManagerParams,
  useDisplaySettingsManager,
} from './use_display_settings_manager';

const DEFAULT_THEME: Partial<DefaultTheme> = {
  colorMode: 'contrastMedium',
  sizeMode: 'touchMedium',
};
const ACTIVE_VOTING_SESSION_VOTES: VotesDict = {};
const NEW_VOTING_SESSION_VOTES = undefined;

let currentTheme: DefaultTheme;
let displaySettingsManager: DisplaySettingsManagerContextInterface;

function TestHookWrapper(props: UseDisplaySettingsManagerParams): null {
  currentTheme = React.useContext(ThemeContext);
  displaySettingsManager = React.useContext(DisplaySettingsManagerContext);

  useDisplaySettingsManager(props);

  return null;
}

test('Resets theme when election official logs in', () => {
  const { rerender } = render(
    <TestHookWrapper
      authStatus={{
        status: 'logged_in',
        user: fakeCardlessVoterUser(),
        sessionExpiresAt: fakeSessionExpiresAt(),
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

  // Simulate changing display settings as voter:
  act(() => {
    displaySettingsManager.setColorMode('contrastLow');
    displaySettingsManager.setSizeMode('touchExtraLarge');
  });
  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'touchExtraLarge',
    })
  );

  // Should reset display settings on Election Manager login:
  rerender(
    <TestHookWrapper
      authStatus={{
        status: 'logged_in',
        user: fakeElectionManagerUser(),
        sessionExpiresAt: fakeSessionExpiresAt(),
      }}
      votes={ACTIVE_VOTING_SESSION_VOTES}
    />
  );
  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>(DEFAULT_THEME)
  );

  // Simulate changing display settings as Election Manager:
  act(() => {
    displaySettingsManager.setColorMode('contrastHighDark');
    displaySettingsManager.setSizeMode('touchSmall');
  });
  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastHighDark',
      sizeMode: 'touchSmall',
    })
  );

  // Should return to voter settings on return to voter session:
  rerender(
    <TestHookWrapper
      authStatus={{
        status: 'logged_in',
        user: fakeCardlessVoterUser(),
        sessionExpiresAt: fakeSessionExpiresAt(),
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
});

test('Resets theme to default if returning to a new voter session', () => {
  const { rerender } = render(
    <TestHookWrapper
      authStatus={{
        status: 'logged_in',
        user: fakeCardlessVoterUser(),
        sessionExpiresAt: fakeSessionExpiresAt(),
      }}
      votes={ACTIVE_VOTING_SESSION_VOTES}
    />,
    { vxTheme: DEFAULT_THEME }
  );

  // Simulate changing display settings as voter:
  act(() => {
    displaySettingsManager.setColorMode('contrastLow');
    displaySettingsManager.setSizeMode('touchExtraLarge');
  });

  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastLow',
      sizeMode: 'touchExtraLarge',
    })
  );

  // Simulate logging in ang changing display settings as Election Manager:
  rerender(
    <TestHookWrapper
      authStatus={{
        status: 'logged_in',
        user: fakeElectionManagerUser(),
        sessionExpiresAt: fakeSessionExpiresAt(),
      }}
      votes={ACTIVE_VOTING_SESSION_VOTES}
    />
  );
  act(() => {
    displaySettingsManager.setColorMode('contrastHighDark');
    displaySettingsManager.setSizeMode('touchSmall');
  });
  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>({
      colorMode: 'contrastHighDark',
      sizeMode: 'touchSmall',
    })
  );

  // Should reset to default if voter session has been reset:
  rerender(
    <TestHookWrapper
      authStatus={{
        status: 'logged_in',
        user: fakeCardlessVoterUser(),
        sessionExpiresAt: fakeSessionExpiresAt(),
      }}
      votes={NEW_VOTING_SESSION_VOTES}
    />
  );
  expect(currentTheme).toEqual(
    expect.objectContaining<Partial<DefaultTheme>>(DEFAULT_THEME)
  );
});
