import userEvent from '@testing-library/user-event';
import { DateTime } from 'luxon';
import { expect, test, vi } from 'vitest';
import { render, screen } from '../test/react_testing_library';
import { ElectricalTestingScreenNew } from './electrical_testing_screen_new';
import { Icons } from './icons';
import { P } from './typography';

test('single task', async () => {
  const powerDown = vi.fn();
  const toggleIsRunning = vi.fn();
  render(
    <ElectricalTestingScreenNew
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
    />
  );

  await screen.findByText('Test Status Message');
  await screen.findByText(/06\/01\/2025/);

  const buttons = await screen.findAllByRole('button');
  const powerOffButton = buttons.pop();
  expect(powerOffButton).toHaveTextContent('Power Off');
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
    <ElectricalTestingScreenNew
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
    />
  );

  await screen.findByText('Body text.');

  const buttons = await screen.findAllByRole('button');
  const powerOffButton = buttons.pop();
  expect(powerOffButton).toHaveTextContent('Power Off');
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

test('power off', async () => {
  const powerDown = vi.fn();
  const toggleIsRunning = vi.fn();
  render(
    <ElectricalTestingScreenNew
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
    />
  );

  const buttons = await screen.findAllByRole('button');
  const powerOffButton = buttons.pop()!;
  expect(powerOffButton).toHaveTextContent('Power Off');
  userEvent.click(powerOffButton);
  expect(powerDown).toHaveBeenCalledOnce();
});
