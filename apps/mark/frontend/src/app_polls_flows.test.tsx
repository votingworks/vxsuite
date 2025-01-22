import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { screen, within } from '../test/react_testing_library';
import { buildApp } from '../test/helpers/build_app';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

const electionGeneralDefinition = readElectionGeneralDefinition();

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers();
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

vi.setConfig({
  testTimeout: 15000,
});

test('full polls flow', async () => {
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_closed_initial',
  });
  const { renderApp } = buildApp(apiMock);

  renderApp();
  await vi.waitFor(() => screen.getByText('Polls Closed'));
  screen.getByText('Insert a poll worker card to open.');

  // Open Polls
  apiMock.setAuthStatusPollWorkerLoggedIn(electionGeneralDefinition);
  apiMock.expectSetPollsState('polls_open');
  apiMock.expectGetElectionState({
    pollsState: 'polls_open',
  });
  await vi.waitFor(() =>
    screen.getByText(hasTextAcrossElements('Polls: Closed'))
  );
  userEvent.click(await vi.waitFor(() => screen.getByText('Open Polls')));
  const openModal = await vi.waitFor(() => screen.getByRole('alertdialog'));
  userEvent.click(within(openModal).getByText('Open Polls'));
  await vi.waitFor(() =>
    screen.getByText(hasTextAcrossElements('Polls: Open'))
  );
  apiMock.setAuthStatusLoggedOut();
  await vi.waitFor(() => screen.getByText('Insert Card'));

  // Pause Voting
  apiMock.setAuthStatusPollWorkerLoggedIn(electionGeneralDefinition);
  apiMock.expectSetPollsState('polls_paused');
  apiMock.expectGetElectionState({
    pollsState: 'polls_paused',
  });
  await vi.waitFor(() =>
    screen.getByText(hasTextAcrossElements('Polls: Open'))
  );
  userEvent.click(screen.getByText('View More Actions'));
  userEvent.click(await vi.waitFor(() => screen.getByText('Pause Voting')));
  const pauseModal = await vi.waitFor(() => screen.getByRole('alertdialog'));
  userEvent.click(within(pauseModal).getByText('Pause Voting'));
  await vi.waitFor(() =>
    screen.getByText(hasTextAcrossElements('Polls: Paused'))
  );
  apiMock.setAuthStatusLoggedOut();
  await vi.waitFor(() => screen.getByText('Voting Paused'));

  // Resume Voting
  apiMock.setAuthStatusPollWorkerLoggedIn(electionGeneralDefinition);
  apiMock.expectSetPollsState('polls_open');
  apiMock.expectGetElectionState({
    pollsState: 'polls_open',
  });
  await vi.waitFor(() =>
    screen.getByText(hasTextAcrossElements('Polls: Paused'))
  );
  userEvent.click(await vi.waitFor(() => screen.getByText('Resume Voting')));
  const resumeModal = await vi.waitFor(() => screen.getByRole('alertdialog'));
  userEvent.click(within(resumeModal).getByText('Resume Voting'));
  await vi.waitFor(() =>
    screen.getByText(hasTextAcrossElements('Polls: Open'))
  );
  apiMock.setAuthStatusLoggedOut();
  await vi.waitFor(() => screen.getByText('Insert Card'));

  // Close Polls
  apiMock.setAuthStatusPollWorkerLoggedIn(electionGeneralDefinition);
  apiMock.expectSetPollsState('polls_closed_final');
  apiMock.expectGetElectionState({
    pollsState: 'polls_closed_final',
  });
  await vi.waitFor(() =>
    screen.getByText(hasTextAcrossElements('Polls: Open'))
  );
  userEvent.click(screen.getByText('View More Actions'));
  userEvent.click(screen.getByText('Close Polls'));
  const closeModal = await vi.waitFor(() => screen.getByRole('alertdialog'));
  userEvent.click(within(closeModal).getByText('Close Polls'));
  await vi.waitFor(() =>
    screen.getByText(hasTextAcrossElements('Polls: Closed'))
  );
  apiMock.setAuthStatusLoggedOut();
  await vi.waitFor(() => screen.getByText('Polls Closed'));
  screen.getByText('Voting is complete.');
});

test('can close polls from paused', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetElectionRecord(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_paused',
  });

  renderApp();
  await vi.waitFor(() => screen.getByText('Voting Paused'));
  screen.getByText('Insert a poll worker card to resume voting.');

  // Close Polls
  apiMock.setAuthStatusPollWorkerLoggedIn(electionGeneralDefinition);
  apiMock.expectSetPollsState('polls_closed_final');
  apiMock.expectGetElectionState({
    pollsState: 'polls_closed_final',
  });
  await vi.waitFor(() =>
    screen.getByText(hasTextAcrossElements('Polls: Paused'))
  );
  userEvent.click(screen.getByText('Close Polls'));
  const closeModal = await vi.waitFor(() => screen.getByRole('alertdialog'));
  userEvent.click(within(closeModal).getByText('Close Polls'));
  await vi.waitFor(() =>
    screen.getByText(hasTextAcrossElements('Polls: Closed'))
  );
  apiMock.setAuthStatusLoggedOut();
  await vi.waitFor(() => screen.getByText('Polls Closed'));
  screen.getByText('Voting is complete.');
});

test('no buttons to change polls from closed final', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetElectionRecord(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_closed_final',
  });

  renderApp();
  await vi.waitFor(() => screen.getByText('Polls Closed'));
  screen.getByText('Voting is complete.');

  apiMock.setAuthStatusPollWorkerLoggedIn(electionGeneralDefinition);
  await vi.waitFor(() =>
    screen.getByText(hasTextAcrossElements('Polls: Closed'))
  );
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
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetElectionRecord(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_closed_final',
  });

  renderApp();
  await vi.waitFor(() => screen.getByText('Polls Closed'));
  apiMock.setAuthStatusSystemAdministratorLoggedIn();
  apiMock.expectSetPollsState('polls_paused');
  apiMock.expectGetElectionState({
    pollsState: 'polls_paused',
  });

  userEvent.click(
    await vi.waitFor(() => screen.getByText('Reset Polls to Paused'))
  );
  const modal = await vi.waitFor(() => screen.getByRole('alertdialog'));
  userEvent.click(
    await vi.waitFor(() =>
      within(modal).getByRole('button', { name: 'Reset Polls to Paused' })
    )
  );
  await vi.waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  await vi.waitFor(() => {
    expect(
      screen.getByText('Reset Polls to Paused').closest('button')!
    ).toBeDisabled();
  });

  apiMock.setAuthStatusLoggedOut();
  await vi.waitFor(() => screen.getByText('Voting Paused'));
});
