import { beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { mockKiosk } from '@votingworks/test-utils';
import { isVxDev } from '@votingworks/utils';
import {
  screen,
  waitForElementToBeRemoved,
} from '../test/react_testing_library';

import { SystemAdministratorScreenContents } from './system_administrator_screen_contents';
import { newTestContext } from '../test/test_context';
import { mockUsbDriveStatus } from './test-utils/mock_usb_drive';

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isVxDev: vi.fn(),
}));

const { render, mockApiClient } = newTestContext({ skipUiStringsApi: true });

beforeEach(() => {
  vi.mocked(isVxDev).mockImplementation(() => false);
  window.kiosk = undefined;
});

const renderTestCases: Array<{
  description: string;
  displayRemoveCardToLeavePromptPropValue?: boolean;
  simulateVxDev?: boolean;
  shouldRemoveCardToLeavePromptBeDisplayed: boolean;
  shouldQuitButtonBeDisplayed: boolean;
}> = [
  {
    description: 'base case',
    shouldRemoveCardToLeavePromptBeDisplayed: false,
    shouldQuitButtonBeDisplayed: false,
  },
  {
    description: 'when displayRemoveCardToLeavePrompt is specified',
    displayRemoveCardToLeavePromptPropValue: true,
    shouldRemoveCardToLeavePromptBeDisplayed: true,
    shouldQuitButtonBeDisplayed: false,
  },
  {
    description: 'when on VxDev',
    simulateVxDev: true,
    shouldRemoveCardToLeavePromptBeDisplayed: false,
    shouldQuitButtonBeDisplayed: true,
  },
  {
    description:
      'when displayRemoveCardToLeavePrompt is specified and on VxDev',
    displayRemoveCardToLeavePromptPropValue: true,
    simulateVxDev: true,
    shouldRemoveCardToLeavePromptBeDisplayed: true,
    shouldQuitButtonBeDisplayed: true,
  },
];

test.each(renderTestCases)(
  'SystemAdministratorScreenContents renders expected contents ($description)',
  ({
    displayRemoveCardToLeavePromptPropValue,
    simulateVxDev,
    shouldRemoveCardToLeavePromptBeDisplayed,
    shouldQuitButtonBeDisplayed,
  }) => {
    if (simulateVxDev) {
      vi.mocked(isVxDev).mockImplementation(() => true);
    }
    const unconfigureMachine = vi.fn();
    render(
      <SystemAdministratorScreenContents
        displayRemoveCardToLeavePrompt={displayRemoveCardToLeavePromptPropValue}
        primaryText="To adjust settings for the current election, please insert an election manager card."
        unconfigureMachine={unconfigureMachine}
        isMachineConfigured
        logOut={vi.fn()}
        usbDriveStatus={mockUsbDriveStatus('mounted')}
      />
    );

    screen.getByText(
      'To adjust settings for the current election, please insert an election manager card.'
    );
    if (shouldRemoveCardToLeavePromptBeDisplayed) {
      screen.getByText(
        'Remove the system administrator card to leave this screen.'
      );
    } else {
      expect(
        screen.queryByText(
          'Remove the system administrator card to leave this screen.'
        )
      ).not.toBeInTheDocument();
    }

    // These buttons are all tested further in their respective test files
    screen.getByRole('button', { name: 'Unconfigure Machine' });
    screen.getByRole('button', { name: 'Save Logs' });

    if (shouldQuitButtonBeDisplayed) {
      screen.getByRole('button', { name: 'Quit' });
    } else {
      expect(
        screen.queryByRole('button', { name: 'Quit' })
      ).not.toBeInTheDocument();
    }
  }
);

test('Quit button makes expected call', () => {
  vi.mocked(isVxDev).mockImplementation(() => true);
  window.kiosk = mockKiosk(vi.fn);
  const unconfigureMachine = vi.fn();
  render(
    <SystemAdministratorScreenContents
      primaryText="To adjust settings for the current election, please insert an election manager card."
      unconfigureMachine={unconfigureMachine}
      isMachineConfigured
      logOut={vi.fn()}
      usbDriveStatus={mockUsbDriveStatus('mounted')}
    />
  );

  userEvent.click(screen.getByRole('button', { name: 'Quit' }));
  expect(window.kiosk.quit).toBeCalledTimes(1);
});

test('Quit button does nothing when kiosk is undefined', () => {
  vi.mocked(isVxDev).mockImplementation(() => true);
  window.kiosk = undefined;
  const unconfigureMachine = vi.fn();
  render(
    <SystemAdministratorScreenContents
      primaryText="To adjust settings for the current election, please insert an election manager card."
      unconfigureMachine={unconfigureMachine}
      isMachineConfigured
      logOut={vi.fn()}
      usbDriveStatus={mockUsbDriveStatus('mounted')}
    />
  );

  userEvent.click(screen.getByRole('button', { name: 'Quit' }));
});

test('Reset Polls to Paused button not rendered if not specified', () => {
  render(
    <SystemAdministratorScreenContents
      primaryText="Primary Text"
      unconfigureMachine={vi.fn()}
      isMachineConfigured
      logOut={vi.fn()}
      usbDriveStatus={mockUsbDriveStatus('mounted')}
    />
  );

  expect(
    screen.queryByRole('button', { name: 'Reset Polls to Paused' })
  ).not.toBeInTheDocument();
});

test('Reset Polls to Paused rendered if callback and flag specified', () => {
  render(
    <SystemAdministratorScreenContents
      primaryText="Primary Text"
      unconfigureMachine={vi.fn()}
      isMachineConfigured
      resetPollsToPausedText="Reset Polls to Paused Text"
      resetPollsToPaused={vi.fn()}
      logOut={vi.fn()}
      usbDriveStatus={mockUsbDriveStatus('mounted')}
    />
  );

  screen.getByRole('button', { name: 'Reset Polls to Paused' });
});

test('Set Date and Time button', async () => {
  const logOut = vi.fn();
  mockApiClient.setClock.mockResolvedValueOnce(undefined as never);
  render(
    <SystemAdministratorScreenContents
      primaryText="Primary Text"
      unconfigureMachine={vi.fn()}
      isMachineConfigured
      logOut={logOut}
      usbDriveStatus={mockUsbDriveStatus('mounted')}
    />
  );

  userEvent.click(screen.getByRole('button', { name: 'Set Date and Time' }));
  screen.getByRole('heading', { name: 'Set Date and Time' });
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitForElementToBeRemoved(screen.queryByRole('alertdialog'));
  expect(logOut).toBeCalledTimes(1);
});
