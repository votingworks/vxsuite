import { hasTextAcrossElements } from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import { screen, waitFor, within } from '../test/react_testing_library';
import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { buildApp } from '../test/helpers/build_app';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionDefinition(null);
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

jest.setTimeout(15000);

test('full polls flow', async () => {
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionDefinition(null);
  const { renderApp, storage, logger } = buildApp(apiMock);
  await setElectionInStorage(storage, electionSampleDefinition);
  await setStateInStorage(storage, { pollsState: 'polls_closed_initial' });
  renderApp();
  await screen.findByText('Polls Closed');
  screen.getByText('Insert Poll Worker card to open.');

  // Open Polls
  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition);
  await screen.findByText(hasTextAcrossElements('Polls: Closed'));
  userEvent.click(screen.getByText('Open Polls'));
  await screen.findByText('No Polls Opened Report on Card');
  userEvent.click(screen.getByText('Open Polls on VxMarkScan Now'));
  await screen.findByText(hasTextAcrossElements('Polls: Open'));
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Insert Card');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.PollsOpened,
    'poll_worker',
    expect.anything()
  );

  // Pause Voting
  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition);
  await screen.findByText(hasTextAcrossElements('Polls: Open'));
  userEvent.click(screen.getByText('View More Actions'));
  userEvent.click(screen.getByText('Pause Voting'));
  await screen.findByText('No Voting Paused Report on Card');
  userEvent.click(screen.getByText('Pause Voting on VxMarkScan Now'));
  await screen.findByText(hasTextAcrossElements('Polls: Paused'));
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Voting Paused');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.VotingPaused,
    'poll_worker',
    expect.anything()
  );

  // Resume Voting
  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition);
  await screen.findByText(hasTextAcrossElements('Polls: Paused'));
  userEvent.click(screen.getByText('Resume Voting'));
  await screen.findByText('No Voting Resumed Report on Card');
  userEvent.click(screen.getByText('Resume Voting on VxMarkScan Now'));
  await screen.findByText(hasTextAcrossElements('Polls: Open'));
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Insert Card');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.VotingResumed,
    'poll_worker',
    expect.anything()
  );

  // Close Polls
  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition);
  await screen.findByText(hasTextAcrossElements('Polls: Open'));
  userEvent.click(screen.getByText('View More Actions'));
  userEvent.click(screen.getByText('Close Polls'));
  await screen.findByText('No Polls Closed Report on Card');
  userEvent.click(screen.getByText('Close Polls on VxMarkScan Now'));
  await screen.findByText(hasTextAcrossElements('Polls: Closed'));
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Polls Closed');
  screen.getByText('Voting is complete.');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.PollsClosed,
    'poll_worker',
    expect.anything()
  );
});

test('can close from paused', async () => {
  const { renderApp, storage } = buildApp(apiMock);
  await setElectionInStorage(storage, electionSampleDefinition);
  await setStateInStorage(storage, { pollsState: 'polls_paused' });
  renderApp();
  await screen.findByText('Voting Paused');
  screen.getByText('Insert Poll Worker card to resume voting.');

  // Close Polls
  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition);
  await screen.findByText(hasTextAcrossElements('Polls: Paused'));
  userEvent.click(screen.getByText('Close Polls'));
  await screen.findByText('No Polls Closed Report on Card');
  userEvent.click(screen.getByText('Close Polls on VxMarkScan Now'));
  await screen.findByText(hasTextAcrossElements('Polls: Closed'));
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Polls Closed');
  screen.getByText('Voting is complete.');
});

test('no buttons to change polls from closed final', async () => {
  const { renderApp, storage } = buildApp(apiMock);
  await setElectionInStorage(storage, electionSampleDefinition);
  await setStateInStorage(storage, { pollsState: 'polls_closed_final' });
  renderApp();
  await screen.findByText('Polls Closed');
  screen.getByText('Voting is complete.');

  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition);
  await screen.findByText(hasTextAcrossElements('Polls: Closed'));
  expect(
    screen.queryByRole('button', { name: /open/i })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /pause/i })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /close/i })
  ).not.toBeInTheDocument();
});

test('can reset polls to paused with system administrator card', async () => {
  const { renderApp, storage } = buildApp(apiMock);
  await setElectionInStorage(storage, electionSampleDefinition);
  await setStateInStorage(storage, { pollsState: 'polls_closed_final' });
  renderApp();
  await screen.findByText('Polls Closed');
  apiMock.setAuthStatusSystemAdministratorLoggedIn();

  userEvent.click(await screen.findByText('Reset Polls to Paused'));
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(
    await within(modal).findByRole('button', { name: 'Reset Polls to Paused' })
  );
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  expect(
    screen.getByText('Reset Polls to Paused').closest('button')!
  ).toBeDisabled();

  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Voting Paused');
});
