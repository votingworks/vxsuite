import { mockOf } from '@votingworks/test-utils';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import { Router } from 'react-router-dom';
import { createApiMock, ApiMock } from '../../test/helpers/mock_api_client';
import { render, screen } from '../../test/react_testing_library';
import { JammedPage } from './jammed_page';
import { RemoveJammedSheetScreen } from './remove_jammed_sheet_screen';
import {
  mockCardlessVoterLoggedInAuth,
  mockPollWorkerAuth,
} from '../../test/helpers/mock_auth';

jest.mock('./remove_jammed_sheet_screen');

let apiMock: ApiMock;
beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

beforeEach(() => {
  mockOf(RemoveJammedSheetScreen).mockImplementation(() => (
    <div>mockRemoveJammedSheetScreen</div>
  ));
});

test('renders voter-facing content for cardless voter session', () => {
  const mockHistory = createMemoryHistory();

  mockOf(RemoveJammedSheetScreen).mockImplementation(() => (
    <div>mockRemoveJammedSheetScreen</div>
  ));

  render(
    <Router history={mockHistory}>
      <JammedPage
        authStatus={mockCardlessVoterLoggedInAuth(electionGeneralDefinition)}
        votes={{ contest1: ['yes'] }}
      />
    </Router>
  );

  screen.getByText(/alert a poll worker/i);
  expect(
    screen.queryByText('mockRemoveJammedSheetScreen')
  ).not.toBeInTheDocument();
  expect(mockHistory.location.pathname).toEqual('/ready-to-review');
});

test('renders poll-worker-facing content for poll worker auth', () => {
  const mockHistory = createMemoryHistory();

  mockOf(RemoveJammedSheetScreen).mockImplementation(() => (
    <div>mockRemoveJammedSheetScreen</div>
  ));

  render(
    <Router history={mockHistory}>
      <JammedPage
        authStatus={mockPollWorkerAuth(electionGeneralDefinition)}
        votes={{ contest1: ['yes'] }}
      />
    </Router>
  );

  screen.getByText('mockRemoveJammedSheetScreen');
  expect(screen.queryByText(/alert a poll worker/i)).not.toBeInTheDocument();
  expect(mockHistory.location.pathname).toEqual('/ready-to-review');
});

test('renders poll-worker-facing content for logged-out auth', () => {
  const mockHistory = createMemoryHistory();

  mockOf(RemoveJammedSheetScreen).mockImplementation(() => (
    <div>mockRemoveJammedSheetScreen</div>
  ));

  render(
    <Router history={mockHistory}>
      <JammedPage authStatus={{ status: 'logged_out', reason: 'no_card' }} />
    </Router>
  );

  screen.getByText('mockRemoveJammedSheetScreen');
  expect(screen.queryByText(/alert a poll worker/i)).not.toBeInTheDocument();
});
