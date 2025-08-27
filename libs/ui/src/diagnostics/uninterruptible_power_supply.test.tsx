import { beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { UninterruptiblePowerSupplyScreen } from './uninterruptible_power_supply';
import { render, screen } from '../../test/react_testing_library';

let passTest: () => void;
let failTest: () => void;

beforeEach(() => {
  passTest = vi.fn();
  failTest = vi.fn();
});

test('renders heading and action buttons', async () => {
  render(
    <UninterruptiblePowerSupplyScreen passTest={passTest} failTest={failTest} />
  );

  expect(
    await screen.findByRole('heading', {
      name: 'Uninterruptible Power Supply Test',
    })
  ).toBeInTheDocument();

  screen.getByRole('button', { name: 'UPS Is Fully Charged' });
  screen.getByRole('button', { name: 'UPS Is Not Fully Charged' });
});

test('user confirms UPS is fully charged', async () => {
  render(
    <UninterruptiblePowerSupplyScreen passTest={passTest} failTest={failTest} />
  );

  userEvent.click(await screen.findByText('UPS Is Fully Charged'));

  expect(passTest).toHaveBeenCalledTimes(1);
  expect(failTest).not.toHaveBeenCalled();
});

test('user confirms UPS is not fully charged', async () => {
  render(
    <UninterruptiblePowerSupplyScreen passTest={passTest} failTest={failTest} />
  );

  userEvent.click(await screen.findByText('UPS Is Not Fully Charged'));

  expect(failTest).toHaveBeenCalledTimes(1);
  expect(passTest).not.toHaveBeenCalled();
});
