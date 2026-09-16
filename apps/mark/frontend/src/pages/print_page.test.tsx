import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render as renderWithBallotContext } from '../../test/test_utils.js';
import { createQueryClient, getPrintJobStatus } from '../api.js';
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

function renderPrintPage({
  endVoterSession = vi.fn().mockResolvedValue(undefined),
  resetBallot = vi.fn(),
} = {}) {
  renderWithBallotContext(provideApi(apiMock, <PrintPage />), {
    ballotStyleId: '12',
    precinctId: '23',
    hasPrintedBallot: true,
    printJobId: MOCK_PRINT_JOB_ID,
    endVoterSession,
    resetBallot,
  });
  return { endVoterSession, resetBallot };
}

test('shows the failure modal over the printing screen', async () => {
  apiMock.setPrintJobStatus({
    outcome: 'failed',
    reason: 'Unable to send data to printer.',
  });
  renderPrintPage();

  await screen.findByText(/Printing Your Ballot/i);
  await screen.findByText('Ballot Not Printed');
});

test('closing the failure modal ends the voter session', async () => {
  apiMock.setPrintJobStatus({ outcome: 'failed' });
  const { endVoterSession, resetBallot } = renderPrintPage();

  await screen.findByText('Ballot Not Printed');
  screen.getByText(
    'The ballot was not sent to the printer. Ask for a poll worker for help.'
  );

  userEvent.click(screen.getByText('Close'));

  await waitFor(() => {
    expect(endVoterSession).toHaveBeenCalledTimes(1);
  });
  expect(resetBallot).toHaveBeenCalledTimes(1);
  expect(resetBallot).toHaveBeenCalledWith();
});

test('shows no failure modal while the job is in progress', async () => {
  apiMock.setPrintJobStatus({ outcome: 'in-progress' });
  renderPrintPage();

  await screen.findByText(/Printing Your Ballot/i);
  expect(screen.queryByText('Ballot Not Printed')).toBeNull();
});

test('clears the settled job status so a reused job id is not read from cache', async () => {
  const queryClient = createQueryClient();
  const queryKey = getPrintJobStatus.queryKey(MOCK_PRINT_JOB_ID);

  apiMock.setPrintJobStatus({ outcome: 'sent-to-printer' });
  const resetBallot = vi.fn();
  const { unmount } = renderWithBallotContext(
    provideApi(apiMock, <PrintPage />, queryClient),
    {
      ballotStyleId: '12',
      precinctId: '23',
      hasPrintedBallot: true,
      printJobId: MOCK_PRINT_JOB_ID,
      resetBallot,
    }
  );
  await waitFor(() => {
    expect(resetBallot).toHaveBeenCalledWith(true);
  });

  unmount();

  await waitFor(() => {
    expect(queryClient.getQueryData(queryKey)).toBeUndefined();
  });
});
