import userEvent from '@testing-library/user-event';
import { DateTime } from 'luxon';
import { expect, test, vi } from 'vitest';
import { assertDefined, ok } from '@votingworks/basics';
import { screen } from '../test/react_testing_library';
import { ElectricalTestingScreen } from './electrical_testing_screen';
import { Icons } from './icons';
import { P } from './typography';
import { newTestContext } from '../test/test_context';

const { mockApiClient, render } = newTestContext();

test('single task', async () => {
  const powerDown = vi.fn();
  const toggleIsRunning = vi.fn();
  render(
    <ElectricalTestingScreen
      tasks={[
        {
          id: 'test',
          icon: <Icons.Display />,
          title: 'Test',
          isRunning: true,
          toggleIsRunning,
          statusMessage: 'Test Status Message',
          updatedAt: DateTime.fromObject({ year: 2025, month: 6, day: 1 }),
        },
      ]}
      powerDown={powerDown}
      perRow={1}
      apiClient={mockApiClient}
    />
  );

  await screen.findByText('Test Status Message');
  await screen.findByText(/06\/01\/2025/);

  const buttons = await screen.findAllByRole('button');
  const powerDownButton = buttons.pop();
  expect(powerDownButton).toHaveTextContent('Power Down');
  const saveLogsButton = buttons.pop();
  expect(saveLogsButton).toHaveTextContent('Save Logs');
  const signedHashValidationButton = buttons.pop();
  expect(signedHashValidationButton).toHaveTextContent(
    'Signed Hash Validation'
  );
  expect(buttons).toHaveLength(1);

  // Toggle the task once.
  userEvent.click(buttons[0]);
  expect(toggleIsRunning).toHaveBeenCalledOnce();

  // Clicking again calls again.
  userEvent.click(buttons[0]);
  expect(toggleIsRunning).toHaveBeenCalledTimes(2);
});

test('multiple tasks', async () => {
  const powerDown = vi.fn();
  const toggleIsRunning1 = vi.fn();
  const toggleIsRunning2 = vi.fn();
  render(
    <ElectricalTestingScreen
      tasks={[
        {
          id: 'test',
          icon: <Icons.Display />,
          title: 'Test',
          isRunning: true,
          toggleIsRunning: toggleIsRunning1,
          body: <P>Body text.</P>,
        },
        {
          id: 'test2',
          icon: <Icons.Display />,
          title: 'Test #2',
          isRunning: false,
          toggleIsRunning: toggleIsRunning2,
        },
      ]}
      powerDown={powerDown}
      perRow={1}
      apiClient={mockApiClient}
    />
  );

  await screen.findByText('Body text.');

  const buttons = await screen.findAllByRole('button');
  const powerDownButton = buttons.pop();
  expect(powerDownButton).toHaveTextContent('Power Down');
  const saveLogsButton = buttons.pop();
  expect(saveLogsButton).toHaveTextContent('Save Logs');
  const signedHashValidationButton = buttons.pop();
  expect(signedHashValidationButton).toHaveTextContent(
    'Signed Hash Validation'
  );
  expect(buttons).toHaveLength(2);

  // Toggle the second task once.
  userEvent.click(buttons[1]);
  expect(toggleIsRunning1).not.toHaveBeenCalled();
  expect(toggleIsRunning2).toHaveBeenCalledOnce();

  // Clicking again calls again.
  userEvent.click(buttons[1]);
  expect(toggleIsRunning1).not.toHaveBeenCalled();
  expect(toggleIsRunning2).toHaveBeenCalledTimes(2);
});

test('power down', async () => {
  const powerDown = vi.fn();
  const toggleIsRunning = vi.fn();
  render(
    <ElectricalTestingScreen
      tasks={[
        {
          id: 'test',
          icon: <Icons.Display />,
          title: 'Test',
          isRunning: true,
          toggleIsRunning,
        },
      ]}
      powerDown={powerDown}
      perRow={1}
      apiClient={mockApiClient}
    />
  );

  const buttons = await screen.findAllByRole('button');
  const powerDownButton = buttons.pop()!;
  expect(powerDownButton).toHaveTextContent('Power Down');
  userEvent.click(powerDownButton);
  expect(powerDown).toHaveBeenCalledOnce();
});

test('save logs', async () => {
  mockApiClient.exportLogsToUsb.mockResolvedValueOnce(ok());

  render(
    <ElectricalTestingScreen
      tasks={[]}
      powerDown={vi.fn()}
      perRow={1}
      usbDriveStatus={{ status: 'mounted', mountPoint: '/media/vx/usb-drive' }}
      apiClient={mockApiClient}
    />
  );

  const buttons = await screen.findAllByRole('button');
  const powerDownButton = buttons.pop();
  expect(powerDownButton).toHaveTextContent('Power Down');
  const saveLogsButton = buttons.pop();
  expect(saveLogsButton).toHaveTextContent('Save Logs');

  userEvent.click(assertDefined(saveLogsButton));
  await screen.findByRole('heading', { name: 'Save Logs' });
  userEvent.click(screen.getByText('Save'));
  await screen.findByText('Logs Saved');

  userEvent.click(screen.getByText('Close'));
  expect(screen.queryByRole('alertdialog')).toBeFalsy();

  expect(mockApiClient.exportLogsToUsb).toHaveBeenCalledTimes(1);
  expect(mockApiClient.exportLogsToUsb).toHaveBeenCalledWith({ format: 'vxf' });
});
