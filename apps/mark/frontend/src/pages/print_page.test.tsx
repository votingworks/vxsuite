import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render as renderWithBallotContext } from '../../test/test_utils.js';
import { screen, waitFor } from '../../test/react_testing_library.js';
import { PrintPage } from './print_page.js';
import {
  ApiMock,
  createApiMock,
  MOCK_PRINT_JOB_ID,
  provideApi,
} from '../../test/helpers/mock_api_client.js';

vi.useFakeTimers({ shouldAdvanceTime: true });

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderPrintPage() {
  return renderWithBallotContext(provideApi(apiMock, <PrintPage />), {
    ballotStyleId: '12',
    precinctId: '23',
    hasPrintedBallot: true,
    printJobId: MOCK_PRINT_JOB_ID,
  });
}

test('shows a dismissible failure modal when the ballot is not sent to the printer', async () => {
  apiMock.setPrintJobStatus({
    outcome: 'failed',
    reason: 'Unable to send data to printer.',
  });
  renderPrintPage();

  await screen.findByText('Ballot Not Printed');
  screen.getByText('Unable to send data to printer.');

  userEvent.click(screen.getByText('Close'));
  await waitFor(() => {
    expect(screen.queryByText('Ballot Not Printed')).toBeNull();
  });
});

test('omits the reason when the failure has none', async () => {
  apiMock.setPrintJobStatus({ outcome: 'failed' });
  renderPrintPage();

  await screen.findByText('Ballot Not Printed');
  screen.getByText('The ballot was not sent to the printer. Ask for help.');
});

test('shows no failure modal while the job is in progress', async () => {
  apiMock.setPrintJobStatus({ outcome: 'in-progress' });
  renderPrintPage();

  await screen.findByText(/Printing Your Ballot/i);
  expect(screen.queryByText('Ballot Not Printed')).toBeNull();
});
