import { PrinterRichStatus, PrinterStatus } from '@votingworks/types';
import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
  fakeSystemAdministratorUser,
} from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import {
  ApiMock,
  MOCK_PRINTER_CONFIG,
  createApiMock,
} from '../../test/helpers/mock_api_client';
import { renderInAppContext } from '../../test/render_in_app_context';
import { PrinterAlert } from './printer_alert';
import {
  screen,
  waitForElementToBeRemoved,
} from '../../test/react_testing_library';

jest.useFakeTimers();

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

const ALERT_RICH_STATUS: PrinterRichStatus = {
  state: 'stopped',
  stateReasons: ['door-open-error'],
  markerInfos: [],
};

const ALERT_STATUS: PrinterStatus = {
  connected: true,
  config: MOCK_PRINTER_CONFIG,
  richStatus: ALERT_RICH_STATUS,
};

function setElectionManagerAuth() {
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: fakeElectionManagerUser(),
    sessionExpiresAt: fakeSessionExpiresAt(),
  });
}

function setSystemAdministratorAuth() {
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: fakeSystemAdministratorUser(),
    sessionExpiresAt: fakeSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  });
}

test('shows alert with message which can be dismissed', async () => {
  setElectionManagerAuth();
  apiMock.setPrinterStatus(ALERT_STATUS);
  renderInAppContext(<PrinterAlert />, { apiMock });
  await screen.findByText('Printer Alert');
  await screen.findByText(
    "The printer's door is open. Close the printer's door."
  );
  userEvent.click(screen.getButton('Dismiss'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

test('shows alert only when printer is stopped', async () => {
  setElectionManagerAuth();
  apiMock.setPrinterStatus(ALERT_STATUS);
  renderInAppContext(<PrinterAlert />, { apiMock });
  await screen.findByText('Printer Alert');

  // doesn't show when disconnected
  apiMock.setPrinterStatus({ connected: false });
  await waitForElementToBeRemoved(screen.getByText('Printer Alert'));

  apiMock.setPrinterStatus(ALERT_STATUS);
  await screen.findByText('Printer Alert');

  // doesn't show when rich status is unavailable
  apiMock.setPrinterStatus({ connected: true, config: MOCK_PRINTER_CONFIG });
  await waitForElementToBeRemoved(screen.getByText('Printer Alert'));

  apiMock.setPrinterStatus(ALERT_STATUS);
  await screen.findByText('Printer Alert');

  // doesn't show when printer not stopped
  apiMock.setPrinterStatus({
    connected: true,
    config: MOCK_PRINTER_CONFIG,
    richStatus: {
      state: 'idle',
      stateReasons: ['none'],
      markerInfos: [],
    },
  });
  await waitForElementToBeRemoved(screen.getByText('Printer Alert'));

  apiMock.setPrinterStatus(ALERT_STATUS);
  await screen.findByText('Printer Alert');

  // doesn't show when printer when state reason is "other"
  apiMock.setPrinterStatus({
    connected: true,
    config: MOCK_PRINTER_CONFIG,
    richStatus: {
      state: 'stopped',
      stateReasons: ['other-error'],
      markerInfos: [],
    },
  });
  await waitForElementToBeRemoved(screen.getByText('Printer Alert'));
});

test('alert does not show for system administrators or when logged out', async () => {
  setElectionManagerAuth();
  apiMock.setPrinterStatus(ALERT_STATUS);
  renderInAppContext(<PrinterAlert />, { apiMock });
  await screen.findByText('Printer Alert');

  // doesn't show for system administrators
  setSystemAdministratorAuth();
  await waitForElementToBeRemoved(screen.getByText('Printer Alert'));

  setElectionManagerAuth();
  apiMock.setPrinterStatus(ALERT_STATUS);
  await screen.findByText('Printer Alert');

  // doesn't show when logged out
  apiMock.setAuthStatus({ status: 'logged_out', reason: 'machine_locked' });
  await waitForElementToBeRemoved(screen.getByText('Printer Alert'));
});
