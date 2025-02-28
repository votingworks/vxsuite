import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../test/react_testing_library';
import { ElectricalTestingScreen } from './electrical_testing_screen';

const mockStatusMessages: Array<{
  component: string;
  statusMessage: string;
  updatedAt: string;
}> = [
  {
    component: 'card',
    statusMessage: 'Success',
    updatedAt: '2025-02-28T00:00:00.000Z',
  },
  {
    component: 'usbDrive',
    statusMessage: 'Success',
    updatedAt: '2025-02-28T00:00:01.000Z',
  },
];

test('ElectricalTestingScreen', () => {
  const stopTesting = vi.fn();
  render(
    <ElectricalTestingScreen
      isTestRunning
      graphic={<div>Graphic</div>}
      statusMessages={mockStatusMessages}
      stopTesting={stopTesting}
    />
  );

  screen.getByText('Graphic');
  screen.getByText('[2025-02-28T00:00:00.000Z] card: Success');
  screen.getByText('[2025-02-28T00:00:01.000Z] usbDrive: Success');
  const testButton = screen.getByRole('button', { name: 'Test Button' });
  expect(screen.queryByText(/Last pressed at/)).not.toBeInTheDocument();
  const stopTestingButton = screen.getByRole('button', {
    name: 'Stop Testing',
  });

  userEvent.click(testButton);
  screen.getByText(/Last pressed at/);

  userEvent.click(stopTestingButton);
  expect(stopTesting).toHaveBeenCalledTimes(1);
});

test('ElectricalTestingScreen after testing has been stopped', () => {
  const stopTesting = vi.fn();
  render(
    <ElectricalTestingScreen
      isTestRunning={false}
      graphic={<div>Graphic</div>}
      statusMessages={mockStatusMessages}
      stopTesting={stopTesting}
    />
  );

  screen.getByText('Graphic');
  screen.getByText('[2025-02-28T00:00:00.000Z] card: Success');
  screen.getByText('[2025-02-28T00:00:01.000Z] usbDrive: Success');
  expect(screen.getByRole('button', { name: 'Test Button' })).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Testing Stopped' })
  ).toBeDisabled();
});
