import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { Keybinding, simulateKeyPress } from '@votingworks/ui';
import { render, screen, waitFor } from '../../test/react_testing_library';

import { App } from '../app';
import { advanceTimersAndPromises } from '../../test/helpers/timers';

import {
  contest0,
  contest0candidate0,
  contest0candidate1,
  contest1,
  contest1candidate0,
} from '../../test/helpers/election';

import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

const electionGeneralDefinition = readElectionGeneralDefinition();
const precinctId = '23';
const pollingPlaceId = `${precinctId}-polling-place`;

let apiMock: ApiMock;

function getActiveElement() {
  return document.activeElement;
}

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });
  window.location.href = '/';
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
  apiMock.setDiskSpaceSummary();
  apiMock.setPaperHandlerState('waiting_for_ballot_data');
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('accessible controller handling works', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionRecord(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    pollingPlaceId,
    pollsState: 'polls_open',
  });
  render(<App apiClient={apiMock.mockApiClient} />);
  await advanceTimersAndPromises();
  // Start voter session
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId,
  });
  await screen.findByText('Start Voting');
  screen.getByText(/Center Springfield/);
  // Go to First Contest
  simulateKeyPress(Keybinding.PAGE_NEXT);
  await screen.findByText(contest0.title);
  // Confirm first contest only has 1 seat
  expect(contest0.seats).toEqual(1);

  // Test navigation by accessible controller keyboard event interface. The
  // first focusable element is the contest metadata, which voters can navigate
  // to in order to replay the contest information audio.
  simulateKeyPress(Keybinding.FOCUS_NEXT);
  expect(getActiveElement()).toHaveTextContent(contest0.title);
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
  // Go up first without focus, then down once, should be same as down once:
  // both land on the contest metadata (the first focusable element).
  simulateKeyPress(Keybinding.FOCUS_PREVIOUS);
  simulateKeyPress(Keybinding.FOCUS_NEXT);
  expect(getActiveElement()).toHaveTextContent(contest1.title);
  // Navigating down once more reaches the first contest option.
  simulateKeyPress(Keybinding.FOCUS_NEXT);
  expect(getActiveElement()).toHaveTextContent(contest1candidate0.name);
  simulateKeyPress(Keybinding.PAGE_PREVIOUS);
  await advanceTimersAndPromises();

  // Get focus again, past the contest metadata, onto the first option.
  simulateKeyPress(Keybinding.FOCUS_NEXT);
  expect(getActiveElement()).toHaveTextContent(contest0.title);
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

test('auto-focuses "next" button on contest screen after voting', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionRecord(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    pollingPlaceId,
    pollsState: 'polls_open',
  });
  vi.mocked(apiMock.mockApiClient.getIsPatDeviceConnected).mockResolvedValue(
    true
  );

  render(<App apiClient={apiMock.mockApiClient} />);
  await advanceTimersAndPromises();
  // Start voter session
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId,
  });

  userEvent.click(await screen.findButton('Start Voting'));

  await screen.findByText(contest0.title);

  // Confirm first contest only has 1 seat
  expect(contest0.seats).toEqual(1);

  // Test navigation by PAT input keyboard event interface. The first focusable
  // element is the contest metadata, followed by the contest options.
  simulateKeyPress(Keybinding.PAT_MOVE);
  expect(getActiveElement()).toHaveTextContent(contest0.title);
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
