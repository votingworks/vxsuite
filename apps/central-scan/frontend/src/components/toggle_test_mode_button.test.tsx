import userEvent from '@testing-library/user-event';
import React from 'react';
import { createMemoryHistory } from 'history';
import { Router } from 'react-router-dom';
import { render, screen, within } from '../../test/react_testing_library';
import { ToggleTestModeButton } from './toggle_test_mode_button';
import { ApiMock, createApiMock, provideApi } from '../../test/api';

let apiMock: ApiMock;

beforeEach(() => {
  jest.restoreAllMocks();
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderButton(
  props: Partial<React.ComponentProps<typeof ToggleTestModeButton>> = {},
  history = createMemoryHistory()
) {
  render(
    provideApi(
      apiMock,
      <Router history={history}>
        <ToggleTestModeButton canUnconfigure isTestMode {...props} />
      </Router>
    )
  );
}

test('shows a disabled button when in live mode but the machine cannot be unconfigured', () => {
  renderButton({ canUnconfigure: false, isTestMode: false });

  expect(screen.getButton('Toggle to Test Ballot Mode')).toBeDisabled();
});

test('toggling to official mode', async () => {
  const history = createMemoryHistory({ initialEntries: ['/admin'] });
  renderButton({ canUnconfigure: true, isTestMode: true }, history);

  userEvent.click(screen.getButton('Toggle to Official Ballot Mode'));
  const modal = screen.getByRole('alertdialog');
  within(modal).getByRole('heading', {
    name: 'Toggle to Official Ballot Mode',
  });
  within(modal).getByText(
    'Toggling to Official Ballot Mode will zero out your scanned ballots. Are you sure?'
  );

  expect(history.location.pathname).toEqual('/admin');
  apiMock.expectSetTestMode(false);
  userEvent.click(within(modal).getButton('Toggle to Official Ballot Mode'));
  await screen.findByText('Toggling to Official Ballot Mode');
  expect(history.location.pathname).toEqual('/');
});

test('toggling to test mode', async () => {
  const history = createMemoryHistory({ initialEntries: ['/admin'] });
  renderButton({ canUnconfigure: true, isTestMode: false }, history);

  userEvent.click(screen.getButton('Toggle to Test Ballot Mode'));
  const modal = screen.getByRole('alertdialog');
  within(modal).getByRole('heading', {
    name: 'Toggle to Test Ballot Mode',
  });
  within(modal).getByText(
    'Toggling to Test Ballot Mode will zero out your scanned ballots. Are you sure?'
  );

  expect(history.location.pathname).toEqual('/admin');
  apiMock.expectSetTestMode(true);
  userEvent.click(within(modal).getButton('Toggle to Test Ballot Mode'));
  await screen.findByText('Toggling to Test Ballot Mode');
  expect(history.location.pathname).toEqual('/');
});
