import { expect, test } from 'vitest';
import { render, screen } from '../../test/react_testing_library';
import { createApiMock, provideApi } from '../../test/helpers/mock_api_client';
import { InternalConnectionProblemScreen } from './internal_connection_problem_screen';

function renderWithProviders(child: React.ReactElement) {
  const apiMock = createApiMock();
  return render(provideApi(apiMock, child));
}

test('shows barcode message when barcode is missing', () => {
  renderWithProviders(
    <InternalConnectionProblemScreen
      missingBarcode
      missingPatInput={false}
      isPollWorkerAuth={false}
    />
  );
  screen.getByRole('heading', { name: /Internal Connection Problem/i });
  screen.getByText('Barcode reader is disconnected.');
  screen.getByText('Please ask a poll worker for help.');
});

test('shows accessible controller message when accessible is missing', () => {
  renderWithProviders(
    <InternalConnectionProblemScreen
      missingBarcode={false}
      missingPatInput
      isPollWorkerAuth={false}
    />
  );
  screen.getByRole('heading', { name: /Internal Connection Problem/i });
  screen.getByText('PAT input is disconnected.');
  screen.getByText('Please ask a poll worker for help.');
});

test('shows power down button when poll worker auth', () => {
  renderWithProviders(
    <InternalConnectionProblemScreen
      missingBarcode
      missingPatInput
      isPollWorkerAuth
    />
  );
  screen.getByRole('heading', { name: /Internal Connection Problem/i });
  screen.getByRole('button', { name: /Power Down/i });
  expect(
    screen.queryByText('Please ask a poll worker for help.')
  ).not.toBeInTheDocument();
});
