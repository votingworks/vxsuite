import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { createApiMock, ApiMock } from '../../test/helpers/mock_api_client.js';
import { render, screen } from '../../test/react_testing_library.js';
import { JamClearedPage } from './jam_cleared_page.js';
import { ReplaceJammedSheetScreen } from './replace_jammed_sheet_screen.js';
import {
  mockCardlessVoterLoggedInAuth,
  mockPollWorkerAuth,
} from '../../test/helpers/mock_auth.js';

const electionGeneralDefinition = readElectionGeneralDefinition();

vi.mock(import('./replace_jammed_sheet_screen.js'));

let apiMock: ApiMock;
beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

beforeEach(() => {
  vi.mocked(ReplaceJammedSheetScreen).mockImplementation(() => (
    <div>mockReplaceJammedSheetScreen</div>
  ));
});

test('renders voter-facing content for cardless voter session', () => {
  vi.mocked(ReplaceJammedSheetScreen).mockImplementation(() => (
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
  vi.mocked(ReplaceJammedSheetScreen).mockImplementation(() => (
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
  vi.mocked(ReplaceJammedSheetScreen).mockImplementation(() => (
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
