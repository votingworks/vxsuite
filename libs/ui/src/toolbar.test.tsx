import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../test/react_testing_library';

import {
  BatteryStatus,
  DateTimeDisplay,
  LockMachineButton,
  Toolbar,
} from './toolbar';

vi.useFakeTimers({
  shouldAdvanceTime: true,
});

test('BatteryStatus renders battery level and icon', () => {
  render(<BatteryStatus batteryInfo={{ level: 0.75, discharging: true }} />);
  screen.getByText('75%');
  const icons = screen.getAllByRole('img', { hidden: true });
  expect(icons[0]).toHaveAttribute('data-icon', 'battery-three-quarters');
});

test('BatteryStatus shows charging bolt when not discharging', () => {
  render(<BatteryStatus batteryInfo={{ level: 0.5, discharging: false }} />);
  screen.getByText('50%');
  const icons = screen.getAllByRole('img', { hidden: true });
  const boltIcon = icons.find(
    (icon) => icon.getAttribute('data-icon') === 'bolt'
  );
  expect(boltIcon).toBeDefined();
});

test('BatteryStatus shows warning when low and discharging', () => {
  render(<BatteryStatus batteryInfo={{ level: 0.1, discharging: true }} />);
  screen.getByText('10%');
  const icons = screen.getAllByRole('img', { hidden: true });
  const warningIcon = icons.find(
    (icon) => icon.getAttribute('data-icon') === 'triangle-exclamation'
  );
  expect(warningIcon).toBeDefined();
});

test('BatteryStatus does not show warning when low but charging', () => {
  render(<BatteryStatus batteryInfo={{ level: 0.1, discharging: false }} />);
  screen.getByText('10%');
  const icons = screen.getAllByRole('img', { hidden: true });
  const warningIcon = icons.find(
    (icon) => icon.getAttribute('data-icon') === 'triangle-exclamation'
  );
  expect(warningIcon).toBeUndefined();
});

test('DateTimeDisplay renders current date and time', () => {
  vi.setSystemTime(new Date('2026-01-15T14:30:00'));
  render(<DateTimeDisplay />);
  screen.getByText(/Jan 15/);
});

test('LockMachineButton calls onLock when pressed', () => {
  const onLock = vi.fn();
  render(<LockMachineButton onLock={onLock} />);
  userEvent.click(screen.getByRole('button', { name: 'Lock Machine' }));
  expect(onLock).toHaveBeenCalledTimes(1);
});

test('Toolbar renders children', () => {
  render(
    <Toolbar>
      <span>test content</span>
    </Toolbar>
  );
  screen.getByText('test content');
});
