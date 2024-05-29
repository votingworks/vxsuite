import { SimpleServerStatus } from '@votingworks/mark-scan-backend';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../test/react_testing_library';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../../test/helpers/mock_api_client';
import { PaperHandlerDiagnosticScreen } from './paper_handler_diagnostic_screen';

let apiMock: ApiMock;
let onClose: () => void;

function renderScreen() {
  return render(
    provideApi(apiMock, <PaperHandlerDiagnosticScreen onClose={onClose} />)
  );
}

beforeEach(() => {
  onClose = jest.fn();
  jest.useFakeTimers().setSystemTime(new Date('2022-03-23T11:23:00.000'));
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
    expectedText: 'Please insert a sheet of ballot paper.',
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
    expectedText: 'The test ballot was confirmed and is ejecting to the rear.',
  },
  {
    description: 'success',
    statuses: ['paper_handler_diagnostic.success'],
    expectedText: 'The diagnostic succeeded. You may now close this page.',
  },
  {
    description: 'failure',
    statuses: ['paper_handler_diagnostic.failure'],
    expectedText:
      'The diagnostic failed. You may now close this page to try again.',
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

test('success state can close the screen', async () => {
  expect(onClose).toHaveBeenCalledTimes(0);
  apiMock.setPaperHandlerState('paper_handler_diagnostic.success');
  renderScreen();
  userEvent.click(await screen.findByText('Complete Test'));

  expect(onClose).toHaveBeenCalledTimes(1);
});

test('failure state can close the screen', async () => {
  expect(onClose).toHaveBeenCalledTimes(0);
  apiMock.setPaperHandlerState('paper_handler_diagnostic.failure');
  renderScreen();
  userEvent.click(await screen.findByText('End Test'));

  expect(onClose).toHaveBeenCalledTimes(1);
});
