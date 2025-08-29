import { vi, test, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import {
  render as baseRender,
  screen,
  waitFor,
} from '../../test/react_testing_library';
import { createApiMock, provideApi } from '../../test/helpers/mock_api_client';
import { UpsDiagnosticModalButton } from './ups_diagnostic_modal_button';

vi.mock('../utils/use_sound');

function setUp() {
  const apiMock = createApiMock();

  return {
    apiMock,
    render: (ui: React.ReactNode) => baseRender(provideApi(apiMock, ui)),
  };
}

test('shows modal', () => {
  const { apiMock, render } = setUp();

  render(<UpsDiagnosticModalButton />);
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  apiMock.mockApiClient.assertComplete();
});

test('logs outcomes & closes modal on user confirmation', async () => {
  const { apiMock, render } = setUp();

  render(<UpsDiagnosticModalButton />);

  userEvent.click(screen.getButton('Test Uninterruptible Power Supply'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).toBeInTheDocument()
  );
  apiMock.mockApiClient.assertComplete();

  apiMock.expectLogUpsDiagnosticOutcome('pass');
  userEvent.click(screen.getButton('Yes'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  apiMock.mockApiClient.assertComplete();

  // Re-open the modal to test the "No" path:
  apiMock.expectLogUpsDiagnosticOutcome('fail');
  userEvent.click(screen.getButton('Test Uninterruptible Power Supply'));
  userEvent.click(screen.getButton('No'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  apiMock.mockApiClient.assertComplete();
});
