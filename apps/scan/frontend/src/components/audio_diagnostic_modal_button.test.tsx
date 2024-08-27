import { TestErrorBoundary } from '@votingworks/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import {
  render as baseRender,
  screen,
  waitFor,
  within,
} from '../../test/react_testing_library';
import { AudioDiagnosticModalButton } from './audio_diagnostic_modal_button';
import { useSound } from '../utils/use_sound';
import { ApiClient, ApiClientContext, createQueryClient } from '../api';

jest.mock('../utils/use_sound');

const mockUseSound = jest.mocked(useSound);

function setUp() {
  const mockLogOutcome = jest.fn();
  const apiMock: jest.Mocked<Partial<ApiClient>> = {
    logAudioDiagnosticOutcome: mockLogOutcome,
  };

  const mockPlaySound = jest.fn();
  mockUseSound.mockReturnValue(mockPlaySound);

  return {
    mockLogOutcome,
    mockPlaySound,
    render: (ui: React.ReactNode) =>
      baseRender(
        <TestErrorBoundary>
          <ApiClientContext.Provider value={apiMock as ApiClient}>
            <QueryClientProvider client={createQueryClient()}>
              {ui}
            </QueryClientProvider>
          </ApiClientContext.Provider>
        </TestErrorBoundary>
      ),
  };
}

test('shows modal on press', () => {
  const { render } = setUp();

  render(<AudioDiagnosticModalButton />);
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  userEvent.click(screen.getButton('Test Sound'));
  within(screen.getByRole('alertdialog')).getByText(/did you hear/i);
});

test('plays sound on open', () => {
  const { mockPlaySound, render } = setUp();

  render(<AudioDiagnosticModalButton />);
  expect(mockPlaySound).not.toHaveBeenCalled();

  userEvent.click(screen.getButton('Test Sound'));
  expect(mockPlaySound).toHaveBeenCalled();
});

test('logs outcomes & closes modal on user confirmation', async () => {
  const { mockLogOutcome, render } = setUp();

  render(<AudioDiagnosticModalButton />);
  userEvent.click(screen.getButton('Test Sound'));
  expect(mockLogOutcome).not.toHaveBeenCalled();

  userEvent.click(screen.getButton('Yes'));
  await waitFor(() =>
    expect(mockLogOutcome).toHaveBeenCalledWith({ outcome: 'pass' })
  );
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  // Re-open the modal to test the "No" path:
  userEvent.click(screen.getButton('Test Sound'));
  userEvent.click(screen.getButton('No'));
  await waitFor(() =>
    expect(mockLogOutcome).toHaveBeenCalledWith({ outcome: 'fail' })
  );
});
