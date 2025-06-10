import { vi, test, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { sleep } from '@votingworks/basics';
import {
  render as baseRender,
  screen,
  waitFor,
  within,
} from '../../test/react_testing_library';
import { AudioDiagnosticModalButton } from './audio_diagnostic_modal_button';
import { createApiMock, provideApi } from '../../test/helpers/mock_api_client';

vi.mock('../utils/use_sound');

function setUp() {
  const apiMock = createApiMock();

  return {
    apiMock,
    render: (ui: React.ReactNode) => baseRender(provideApi(apiMock, ui)),
  };
}

test('shows modal and plays sound on press', async () => {
  const { apiMock, render } = setUp();

  render(<AudioDiagnosticModalButton />);
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  apiMock.expectPlaySound('success');

  userEvent.click(screen.getButton('Test Sound'));
  within(screen.getByRole('alertdialog')).getByText(/did you hear/i);

  await sleep(0);
  apiMock.mockApiClient.assertComplete();
});

test('logs outcomes & closes modal on user confirmation', async () => {
  const { apiMock, render } = setUp();
  apiMock.expectPlaySoundRepeated('success');

  render(<AudioDiagnosticModalButton />);

  userEvent.click(screen.getButton('Test Sound'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).toBeInTheDocument()
  );
  apiMock.mockApiClient.assertComplete();

  apiMock.expectLogAudioDiagnosticOutcome('pass');
  userEvent.click(screen.getButton('Yes'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  apiMock.mockApiClient.assertComplete();

  // Re-open the modal to test the "No" path:
  apiMock.expectLogAudioDiagnosticOutcome('fail');
  userEvent.click(screen.getButton('Test Sound'));
  userEvent.click(screen.getButton('No'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  apiMock.mockApiClient.assertComplete();
});
