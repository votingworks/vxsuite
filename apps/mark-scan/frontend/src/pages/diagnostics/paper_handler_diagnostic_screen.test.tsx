import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SimpleServerStatus } from '@votingworks/mark-scan-backend';
import userEvent from '@testing-library/user-event';
import { DiagnosticRecord } from '@votingworks/types';
import { render, screen } from '../../../test/react_testing_library';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../../test/helpers/mock_api_client';
import { PaperHandlerDiagnosticScreen } from './paper_handler_diagnostic_screen';

let apiMock: ApiMock;
let onClose: () => void;

function renderScreen(diagnostic?: DiagnosticRecord) {
  return render(
    provideApi(
      apiMock,
      <PaperHandlerDiagnosticScreen
        onClose={onClose}
        mostRecentPaperHandlerDiagnostic={diagnostic}
      />
    )
  );
}

beforeEach(() => {
  onClose = vi.fn();
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: new Date('2022-03-23T11:23:00.000'),
  });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

interface TestSpec {
  description: string;
  statuses: SimpleServerStatus[];
  expectedText: RegExp | string;
}
const statusesToExpectedText: TestSpec[] = [
  {
    description: 'load paper',
    statuses: [
      'paper_handler_diagnostic.prompt_for_paper',
      'paper_handler_diagnostic.load_paper',
    ],
    expectedText: 'Insert a sheet of ballot paper.',
  },
  {
    description: 'in progress',
    statuses: [
      'paper_handler_diagnostic.print_ballot_fixture',
      'paper_handler_diagnostic.scan_ballot',
      'paper_handler_diagnostic.interpret_ballot',
    ],
    expectedText: 'A test ballot is being printed and scanned.',
  },
  {
    description: 'ejecting',
    statuses: ['paper_handler_diagnostic.eject_to_rear'],
    expectedText: 'The test ballot is being ejected to the ballot box.',
  },
  {
    description: 'success',
    statuses: ['paper_handler_diagnostic.success'],
    expectedText: 'The diagnostic succeeded.',
  },
  {
    description: 'failure without a diagnostic',
    statuses: ['paper_handler_diagnostic.failure'],
    expectedText: 'The diagnostic failed. Exit the page and try again.',
  },
  {
    description: 'default',
    statuses: ['not_accepting_paper'],
    expectedText: /Loading/,
  },
];

describe.each(statusesToExpectedText)(
  'paper handler diagnostic stage - $description',
  ({ statuses, expectedText }) => {
    test.each(statuses)('status %p', async (status) => {
      apiMock.setPaperHandlerState(status);
      renderScreen();
      await screen.findByText(expectedText);
    });
  }
);

test('failure with a diagnostic record and error message', async () => {
  apiMock.setPaperHandlerState('paper_handler_diagnostic.failure');
  const diagnostic: DiagnosticRecord = {
    type: 'mark-scan-paper-handler',
    outcome: 'fail',
    timestamp: new Date().valueOf(),
    message: 'Test error message.',
  };
  renderScreen(diagnostic);
  await screen.findByText(/The diagnostic failed./);
  await screen.findByText(/Test error message./);
});

test('failure with a diagnostic record but no error message', async () => {
  apiMock.setPaperHandlerState('paper_handler_diagnostic.failure');
  const diagnostic: DiagnosticRecord = {
    type: 'mark-scan-paper-handler',
    outcome: 'fail',
    timestamp: new Date().valueOf(),
  };
  renderScreen(diagnostic);
  await screen.findByText(
    'The diagnostic failed. Exit the page and try again.'
  );
});

test('success state can close the screen', async () => {
  expect(onClose).toHaveBeenCalledTimes(0);
  apiMock.setPaperHandlerState('paper_handler_diagnostic.success');
  renderScreen();
  userEvent.click(await screen.findByText('Exit'));

  expect(onClose).toHaveBeenCalledTimes(1);
});

test('failure state can close the screen', async () => {
  expect(onClose).toHaveBeenCalledTimes(0);
  apiMock.setPaperHandlerState('paper_handler_diagnostic.failure');
  renderScreen();
  userEvent.click(await screen.findByText('Exit'));

  expect(onClose).toHaveBeenCalledTimes(1);
});
