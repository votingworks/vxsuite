import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '../../test/react_testing_library';
import { ToggleTestModeButton } from './toggle_test_mode_button';
import { ApiMock, createApiMock, provideApi } from '../../test/api';
import { mockStatus } from '../../test/fixtures';

let apiMock: ApiMock;

beforeEach(() => {
  vi.restoreAllMocks();
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderButton() {
  render(provideApi(apiMock, <ToggleTestModeButton />));
}

test('shows a disabled button when the machine cannot be unconfigured', async () => {
  apiMock.expectGetTestMode(false);
  apiMock.setStatus(
    mockStatus({
      canUnconfigure: false,
    })
  );
  renderButton();

  expect(
    await screen.findByRole('option', {
      name: 'Test Ballot Mode',
      selected: false,
    })
  ).toBeDisabled();
});

test('toggling when there are no ballots', async () => {
  apiMock.expectGetTestMode(true);
  apiMock.setStatus(
    mockStatus({
      canUnconfigure: true,
    })
  );
  renderButton();

  await screen.findByRole('option', {
    name: 'Official Ballot Mode',
    selected: false,
  });

  apiMock.expectSetTestMode(false);
  apiMock.expectGetTestMode(false);
  userEvent.click(
    await screen.findByRole('option', { name: 'Official Ballot Mode' })
  );

  await screen.findByRole('option', {
    name: 'Official Ballot Mode',
    selected: true,
  });

  apiMock.expectSetTestMode(true);
  apiMock.expectGetTestMode(true);
  userEvent.click(
    await screen.findByRole('option', { name: 'Test Ballot Mode' })
  );

  await screen.findByRole('option', {
    name: 'Official Ballot Mode',
    selected: false,
  });
});

test('toggling with ballots, modal confirmation', async () => {
  apiMock.expectGetTestMode(false);
  apiMock.setStatus(
    mockStatus({
      canUnconfigure: true,
      batches: [
        {
          id: 'batch-id',
          label: 'Batch 1',
          batchNumber: 1,
          startedAt: 'sometime',
          count: 1,
        },
      ],
    })
  );
  renderButton();

  await screen.findByRole('option', {
    name: 'Test Ballot Mode',
    selected: false,
  });

  userEvent.click(
    await screen.findByRole('option', { name: 'Test Ballot Mode' })
  );
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Switch to Test Ballot Mode' });

  apiMock.expectSetTestMode(true);
  apiMock.expectGetTestMode(true);
  userEvent.click(within(modal).getButton('Switch to Test Ballot Mode'));
  await screen.findByRole('option', {
    name: 'Test Ballot Mode',
    selected: true,
  });
  expect(modal).not.toBeInTheDocument();

  userEvent.click(
    await screen.findByRole('option', { name: 'Official Ballot Mode' })
  );
  await screen.findByRole('heading', {
    name: 'Switch to Official Ballot Mode',
  });

  apiMock.expectSetTestMode(false);
  apiMock.expectGetTestMode(false);
  userEvent.click(screen.getButton('Switch to Official Ballot Mode'));
  await screen.findByRole('option', {
    name: 'Test Ballot Mode',
    selected: false,
  });
  expect(modal).not.toBeInTheDocument();
});
