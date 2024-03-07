import userEvent from '@testing-library/user-event';
import { deferred } from '@votingworks/basics';
import { ScanDiagnosticOutcome } from '@votingworks/central-scan-backend';
import { ApiMock, createApiMock } from '../../test/api';
import { mockStatus } from '../../test/fixtures';
import {
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { TestScanButton } from './test_scan_button';

let apiMock: ApiMock;

beforeEach(() => {
  jest.restoreAllMocks();
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('disabled behavior', async () => {
  apiMock.setStatus(mockStatus({ isScannerAttached: true }));
  renderInAppContext(<TestScanButton />, { apiMock });
  const button = await screen.findButton('Perform Test Scan');
  expect(button).toBeEnabled();

  apiMock.setStatus(mockStatus({ isScannerAttached: false }));
  await waitFor(() => {
    expect(button).toBeDisabled();
  });

  apiMock.setStatus(mockStatus({ isScannerAttached: true }));
  await waitFor(() => {
    expect(button).toBeEnabled();
  });

  userEvent.click(button);
  await screen.findButton('Scan');

  apiMock.setStatus(mockStatus({ isScannerAttached: false }));
  await waitForElementToBeRemoved(() => screen.queryButton('Scan'));
  screen.getByText(/No scanner is currently detected/);
});

test('happy path', async () => {
  apiMock.setStatus(mockStatus({ isScannerAttached: true }));
  renderInAppContext(<TestScanButton />, { apiMock });
  const button = await screen.findButton('Perform Test Scan');
  userEvent.click(button);
  screen.getByText('Test Scan Diagnostic');
  const { promise, resolve } = deferred<ScanDiagnosticOutcome>();
  apiMock.apiClient.performScanDiagnostic.expectCallWith().returns(promise);
  userEvent.click(screen.getByText('Scan'));
  await screen.findByText('Scanning');
  resolve('pass');
  await screen.findByText('Test Scan Successful');
  userEvent.click(screen.getByText('Close'));
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('fail because no paper', async () => {
  apiMock.setStatus(mockStatus({ isScannerAttached: true }));
  renderInAppContext(<TestScanButton />, { apiMock });
  const button = await screen.findButton('Perform Test Scan');
  userEvent.click(button);
  screen.getByText('Test Scan Diagnostic');
  apiMock.apiClient.performScanDiagnostic.expectCallWith().resolves('no-paper');
  userEvent.click(screen.getByText('Scan'));
  await screen.findByText(/no paper was detected/);
});

test('fail because no bad image', async () => {
  apiMock.setStatus(mockStatus({ isScannerAttached: true }));
  renderInAppContext(<TestScanButton />, { apiMock });
  const button = await screen.findButton('Perform Test Scan');
  userEvent.click(button);
  screen.getByText('Test Scan Diagnostic');
  apiMock.apiClient.performScanDiagnostic.expectCallWith().resolves('fail');
  userEvent.click(screen.getByText('Scan'));
  await screen.findByText(/defects were detected/);
});
