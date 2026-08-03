import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { LanguageCode } from '@votingworks/types';
import { render, screen } from '../../test/react_testing_library';
import {
  ApiMock,
  ApiMockProvider,
  createApiMock,
} from '../../test/mock_api_client';
import { ToggleTestModeButton } from './toggle_test_mode_button';

const NO_TEST_BALLOTS_MESSAGE =
  'Election package does not contain test ballots required for test mode.';

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
  vi.useRealTimers();
});

function mockQueries({
  isTestMode = false,
  testBallotsPresent = true,
  totalPrintCount = 0,
} = {}) {
  // The setTestMode mutation invalidates these queries, so they may refetch.
  apiMock.getTestMode.expectRepeatedCallsWith().resolves(isTestMode);
  apiMock.hasTestBallots.expectRepeatedCallsWith().resolves(testBallotsPresent);
  apiMock.getBallotPrintCounts.expectRepeatedCallsWith().resolves(
    totalPrintCount > 0
      ? [
          {
            ballotStyleId: '1-1',
            precinctId: '20',
            precinctOrSplitName: 'Precinct 20',
            languageCode: LanguageCode.ENGLISH,
            absenteeCount: 0,
            precinctCount: totalPrintCount,
            totalCount: totalPrintCount,
          },
        ]
      : []
  );
}

function renderButton() {
  return render(
    <ApiMockProvider apiMock={apiMock}>
      <ToggleTestModeButton />
    </ApiMockProvider>
  );
}

function getOption(name: string) {
  return screen.getByRole('option', { name });
}

test('toggles to test mode without confirmation when nothing has been printed', async () => {
  mockQueries();
  renderButton();

  await vi.waitFor(() => expect(getOption('Test Ballot Mode')).toBeEnabled());

  apiMock.setTestMode.expectCallWith({ testMode: true }).resolves();
  userEvent.click(getOption('Test Ballot Mode'));

  await vi.waitFor(() => apiMock.setTestMode.assertComplete());
});

test('confirms before toggling when ballots have been printed', async () => {
  mockQueries({ totalPrintCount: 3 });
  renderButton();

  await vi.waitFor(() => expect(getOption('Test Ballot Mode')).toBeEnabled());
  userEvent.click(getOption('Test Ballot Mode'));

  await screen.findByText(
    'Switching to test ballot mode will reset all official ballot print counts to zero.'
  );

  apiMock.setTestMode.expectCallWith({ testMode: true }).resolves();
  userEvent.click(
    screen.getByRole('button', { name: 'Switch to Test Ballot Mode' })
  );

  await vi.waitFor(() => apiMock.setTestMode.assertComplete());
});

test('Cancel closes the confirmation without toggling', async () => {
  mockQueries({ totalPrintCount: 3 });
  renderButton();

  await vi.waitFor(() => expect(getOption('Test Ballot Mode')).toBeEnabled());
  userEvent.click(getOption('Test Ballot Mode'));

  const confirmPrompt =
    'Switching to test ballot mode will reset all official ballot print counts to zero.';
  await screen.findByText(confirmPrompt);
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(screen.queryByText(confirmPrompt)).not.toBeInTheDocument();
  // The absence of a setTestMode call is verified by assertComplete().
});

test('disables the toggle and explains why when the election package has no test ballots', async () => {
  mockQueries({ testBallotsPresent: false });
  renderButton();

  await screen.findByText(NO_TEST_BALLOTS_MESSAGE);
  const testOption = getOption('Test Ballot Mode');
  expect(testOption).toBeDisabled();
  expect(getOption('Official Ballot Mode')).toBeDisabled();

  // Clicking the disabled option must not switch modes. The absence of an
  // expected setTestMode mutation is verified by assertComplete().
  userEvent.click(testOption);
});
