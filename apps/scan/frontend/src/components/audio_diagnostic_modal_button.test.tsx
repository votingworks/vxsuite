import { vi, test, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import {
  render as baseRender,
  screen,
  waitFor,
  within,
} from '../../test/react_testing_library';
import { AudioDiagnosticModalButton } from './audio_diagnostic_modal_button';
import { useSound } from '../utils/use_sound';
import { createApiMock, provideApi } from '../../test/helpers/mock_api_client';

vi.mock('../utils/use_sound');

const mockUseSound = vi.mocked(useSound);

function setUp() {
  // const mockLogOutcome = vi.fn();
  // const apiMock: vi.Mocked<Partial<ApiClient>> = {
  //   logAudioDiagnosticOutcome: mockLogOutcome,
  // };

  const apiMock = createApiMock();

  const mockPlaySound = vi.fn();
  mockUseSound.mockReturnValue(mockPlaySound);

  return {
    apiMock,
    mockPlaySound,
    render: (ui: React.ReactNode) => baseRender(provideApi(apiMock, ui)),
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
  const { apiMock, render } = setUp();

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
