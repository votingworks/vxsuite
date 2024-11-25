import userEvent from '@testing-library/user-event';
import { sleep } from '@votingworks/basics';
import { render, screen, waitFor, within } from '../test/react_testing_library';

import {
  MIN_TIME_TO_UNCONFIGURE_MACHINE_MS,
  UnconfigureMachineButton,
} from './unconfigure_machine_button';

jest.mock('@votingworks/basics', (): typeof import('@votingworks/basics') => ({
  ...jest.requireActual('@votingworks/basics'),
  sleep: jest.fn(),
}));

test('UnconfigureMachineButton interactions', async () => {
  const unconfigureMachine = jest.fn();
  render(
    <UnconfigureMachineButton
      unconfigureMachine={unconfigureMachine}
      isMachineConfigured
    />
  );

  // Cancel the first time
  userEvent.click(screen.getByRole('button', { name: 'Unconfigure Machine' }));
  let modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', {
    name: 'Unconfigure Machine',
  });
  userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(modal).not.toBeInTheDocument());

  // Proceed the second time
  userEvent.click(screen.getByRole('button', { name: 'Unconfigure Machine' }));
  modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', {
    name: 'Unconfigure Machine',
  });
  userEvent.click(
    within(modal).getByRole('button', {
      name: 'Delete All Election Data',
    })
  );
  await within(modal).findByText('Unconfiguring Machine');
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );

  expect(unconfigureMachine).toHaveBeenCalledTimes(1);
  expect(sleep).toHaveBeenCalledTimes(1);
  const sleepTime = (sleep as jest.Mock).mock.calls[0][0];
  expect(sleepTime).toBeGreaterThan(0);
  expect(sleepTime).toBeLessThan(MIN_TIME_TO_UNCONFIGURE_MACHINE_MS);
});

test('UnconfigureMachineButton does not sleep when not necessary', async () => {
  const bufferTimeMs = 100;
  const unconfigureMachine = jest.fn(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, MIN_TIME_TO_UNCONFIGURE_MACHINE_MS + bufferTimeMs);
    });
  });
  render(
    <UnconfigureMachineButton
      unconfigureMachine={unconfigureMachine}
      isMachineConfigured
    />
  );

  userEvent.click(screen.getByRole('button', { name: 'Unconfigure Machine' }));
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(
    within(modal).getByRole('button', {
      name: 'Delete All Election Data',
    })
  );
  await waitFor(
    () => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    { timeout: MIN_TIME_TO_UNCONFIGURE_MACHINE_MS + bufferTimeMs * 2 }
  );

  expect(unconfigureMachine).toHaveBeenCalledTimes(1);
  expect(sleep).toHaveBeenCalledTimes(0);
});

test('UnconfigureMachineButton is disabled if machine not configured', () => {
  render(
    <UnconfigureMachineButton
      unconfigureMachine={jest.fn()}
      isMachineConfigured={false}
    />
  );

  expect(
    screen.getByRole('button', { name: 'Unconfigure Machine' })
  ).toBeDisabled();
});
