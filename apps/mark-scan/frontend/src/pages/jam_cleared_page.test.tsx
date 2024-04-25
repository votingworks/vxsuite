import { mockOf } from '@votingworks/test-utils';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { createApiMock, ApiMock } from '../../test/helpers/mock_api_client';
import { render, screen } from '../../test/react_testing_library';
import { JamClearedPage } from './jam_cleared_page';
import { ReplaceJammedSheetScreen } from './replace_jammed_sheet_screen';
import {
  mockCardlessVoterLoggedInAuth,
  mockPollWorkerAuth,
} from '../../test/helpers/mock_auth';

jest.mock('./replace_jammed_sheet_screen');

let apiMock: ApiMock;
beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

beforeEach(() => {
  mockOf(ReplaceJammedSheetScreen).mockImplementation(() => (
    <div>mockReplaceJammedSheetScreen</div>
  ));
});

test('renders voter-facing content for cardless voter session', () => {
  mockOf(ReplaceJammedSheetScreen).mockImplementation(() => (
    <div>mockReplaceJammedSheetScreen</div>
  ));

  render(
    <JamClearedPage
      authStatus={mockCardlessVoterLoggedInAuth(electionGeneralDefinition)}
      stateMachineState="jam_cleared"
    />
  );

  screen.getByText(/ask a poll worker for help/i);
  expect(
    screen.queryByText('mockReplaceJammedSheetScreen')
  ).not.toBeInTheDocument();
});

test('renders poll-worker-facing content for poll worker auth', () => {
  mockOf(ReplaceJammedSheetScreen).mockImplementation(() => (
    <div>mockReplaceJammedSheetScreen</div>
  ));

  render(
    <JamClearedPage
      authStatus={mockPollWorkerAuth(electionGeneralDefinition)}
      stateMachineState="jam_cleared"
    />
  );

  screen.getByText('mockReplaceJammedSheetScreen');
  expect(
    screen.queryByText(/ask a poll worker for help/i)
  ).not.toBeInTheDocument();
});

test('renders poll-worker-facing content for logged-out auth', () => {
  mockOf(ReplaceJammedSheetScreen).mockImplementation(() => (
    <div>mockReplaceJammedSheetScreen</div>
  ));

  render(
    <JamClearedPage
      authStatus={{ status: 'logged_out', reason: 'no_card' }}
      stateMachineState="jam_cleared"
    />
  );

  screen.getByText('mockReplaceJammedSheetScreen');
  expect(
    screen.queryByText(/ask a poll worker for help/i)
  ).not.toBeInTheDocument();
});
