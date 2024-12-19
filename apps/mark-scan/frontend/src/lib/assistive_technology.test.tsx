import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { mockOf } from '@votingworks/test-utils';
import { Keybinding, simulateKeyPress } from '@votingworks/ui';
import { BallotStyleId } from '@votingworks/types';
import { render, screen, waitFor } from '../../test/react_testing_library';

import { App } from '../app';
import { advanceTimersAndPromises } from '../../test/helpers/timers';

import {
  contest0,
  contest0candidate0,
  contest0candidate1,
  contest1candidate0,
} from '../../test/helpers/election';

import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

const electionGeneralDefinition = readElectionGeneralDefinition();

let apiMock: ApiMock;

function getActiveElement() {
  return document.activeElement;
}

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
  apiMock.setPaperHandlerState('waiting_for_ballot_data');
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

it('accessible controller handling works', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionRecord(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });
  render(<App apiClient={apiMock.mockApiClient} />);
  await advanceTimersAndPromises();
  // Start voter session
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12' as BallotStyleId,
    precinctId: '23',
  });
  await screen.findByText('Start Voting');
  screen.getByText(/Center Springfield/);
  // Go to First Contest
  simulateKeyPress(Keybinding.PAGE_NEXT);
  await screen.findByText(contest0.title);
  // Confirm first contest only has 1 seat
  expect(contest0.seats).toEqual(1);

  // Test navigation by accessible controller keyboard event interface
  simulateKeyPress(Keybinding.FOCUS_NEXT);
  expect(getActiveElement()).toHaveTextContent(contest0candidate0.name);
  simulateKeyPress(Keybinding.FOCUS_NEXT);
  expect(getActiveElement()).toHaveTextContent(contest0candidate1.name);
  simulateKeyPress(Keybinding.FOCUS_PREVIOUS);
  expect(getActiveElement()).toHaveTextContent(contest0candidate0.name);

  // test the edge case of rolling over
  await waitFor(() => {
    simulateKeyPress(Keybinding.FOCUS_PREVIOUS);
    expect(getActiveElement()).toHaveTextContent(contest0candidate1.name);
  });
  await waitFor(() => {
    simulateKeyPress(Keybinding.FOCUS_NEXT);
    expect(getActiveElement()).toHaveTextContent(contest0candidate0.name);
  });

  simulateKeyPress(Keybinding.PAGE_NEXT);
  await advanceTimersAndPromises();
  // go up first without focus, then down once, should be same as down once.
  simulateKeyPress(Keybinding.FOCUS_PREVIOUS);
  simulateKeyPress(Keybinding.FOCUS_NEXT);
  expect(getActiveElement()).toHaveTextContent(contest1candidate0.name);
  simulateKeyPress(Keybinding.PAGE_PREVIOUS);
  await advanceTimersAndPromises();

  // Get focus again
  simulateKeyPress(Keybinding.FOCUS_NEXT);
  expect(getActiveElement()).toHaveTextContent(contest0candidate0.name);

  // select candidate
  simulateKeyPress(Keybinding.SELECT);
  await screen.findByRole('option', {
    name: new RegExp(contest0candidate0.name),
    selected: true,
  });

  simulateKeyPress(Keybinding.SELECT);
  await screen.findByRole('option', {
    name: new RegExp(contest0candidate0.name),
    selected: false,
  });

  // Confirm 'Okay' is only active element on page. Modal is "true" modal.
  userEvent.click(screen.getByText(contest0candidate0.name));
  userEvent.click(screen.getByText(contest0candidate1.name));
  simulateKeyPress(Keybinding.FOCUS_NEXT); // selects Okay button
  simulateKeyPress(Keybinding.FOCUS_NEXT); // Okay button should still be selected
  simulateKeyPress(Keybinding.FOCUS_NEXT); // Okay button should still be selected
  expect(screen.getButton(/Continue/i)).toHaveFocus();
  await advanceTimersAndPromises();
});

it('auto-focuses "next" button on contest screen after voting', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionRecord(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });
  mockOf(apiMock.mockApiClient.getIsPatDeviceConnected).mockResolvedValue(true);

  render(<App apiClient={apiMock.mockApiClient} />);
  await advanceTimersAndPromises();
  // Start voter session
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12' as BallotStyleId,
    precinctId: '23',
  });

  userEvent.click(await screen.findButton('Start Voting'));

  await screen.findByText(contest0.title);

  // Confirm first contest only has 1 seat
  expect(contest0.seats).toEqual(1);

  // Test navigation by PAT input keyboard event interface
  simulateKeyPress(Keybinding.PAT_MOVE);
  expect(getActiveElement()).toHaveTextContent(contest0candidate0.name);
  simulateKeyPress(Keybinding.PAT_MOVE);
  expect(getActiveElement()).toHaveTextContent(contest0candidate1.name);

  // select candidate
  simulateKeyPress(Keybinding.PAT_SELECT);
  await screen.findByRole('option', {
    name: new RegExp(contest0candidate1.name),
    selected: true,
  });

  // Focus should have jumped to the "Next" button because we're using PAT nav
  expect(await screen.findByRole('button', { name: 'Next' })).toHaveFocus();
});
