import { expectPrintToPdf, fakeKiosk } from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import { ALL_PRECINCTS_SELECTION, MemoryHardware } from '@votingworks/utils';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/react_testing_library';
import { App } from './app';

import {
  advanceTimers,
  advanceTimersAndPromises,
} from '../test/helpers/timers';

import { singleSeatContestWithWriteIn } from '../test/helpers/election';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;
let kiosk = fakeKiosk();

/**
 * HACK: The modal library we're using applies an `aria-hidden` attribute
 * to the root element when a modal is open and removes it when the modal
 * is closed, but this isn't happening in the jest environment, for some
 * reason. Works as expected in production.
 * We're removing the attribute here to make sure our getByRole queries work
 * properly.
 */
async function hackActuallyCleanUpReactModal() {
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  window.document.body.firstElementChild?.removeAttribute('aria-hidden');
}

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  kiosk = fakeKiosk();
  window.kiosk = kiosk;
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
  apiMock.setPaperHandlerState('waiting_for_ballot_data');
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

it('Single Seat Contest with Write In', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const hardware = MemoryHardware.buildStandard();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionDefinition(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
    isTestMode: false,
  });

  render(
    <App
      hardware={hardware}
      apiClient={apiMock.mockApiClient}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();

  function getWithinKeyboard(text: string) {
    return within(screen.getByTestId('virtual-keyboard')).getByText(text);
  }

  // Start voter session
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId: '23',
  });

  // Go to First Contest
  userEvent.click(await screen.findByText('Start Voting'));
  advanceTimers();

  // ====================== END CONTEST SETUP ====================== //

  // Advance to Single-Seat Contest with Write-In
  while (!screen.queryByText(singleSeatContestWithWriteIn.title)) {
    fireEvent.click(await screen.findByText('Next'));
    advanceTimers();
  }

  // Test Write-In Candidate Modal Cancel
  fireEvent.click(
    screen.getByText('add write-in candidate').closest('button')!
  );
  fireEvent.click(screen.getByText('Cancel'));

  // Add Write-In Candidate
  fireEvent.click(
    screen.getByText('add write-in candidate').closest('button')!
  );
  screen.getByRole('heading', {
    name: `Write-In: ${singleSeatContestWithWriteIn.title}`,
  });

  // Enter Write-in Candidate Name
  fireEvent.click(getWithinKeyboard('B'));
  fireEvent.click(getWithinKeyboard('O'));
  fireEvent.click(getWithinKeyboard('V'));
  fireEvent.click(getWithinKeyboard('delete'));
  fireEvent.click(getWithinKeyboard('B'));
  fireEvent.click(screen.getByText('Accept'));
  advanceTimers();

  // Remove Write-In Candidate
  fireEvent.click(screen.getByText('BOB').closest('button')!);
  fireEvent.click(screen.getButton('Yes'));
  advanceTimers();

  // Add Different Write-In Candidate
  fireEvent.click(
    screen.getByText('add write-in candidate').closest('button')!
  );
  fireEvent.click(getWithinKeyboard('S').closest('button')!);
  fireEvent.click(getWithinKeyboard('A').closest('button')!);
  fireEvent.click(getWithinKeyboard('L').closest('button')!);
  fireEvent.click(screen.getByText('Accept'));

  await hackActuallyCleanUpReactModal();

  screen.getByRole('option', { name: /SAL/, selected: true });

  // Try to Select Other Candidate when max candidates are selected.
  fireEvent.click(
    screen
      .getByText(singleSeatContestWithWriteIn.candidates[0].name)
      .closest('button')!
  );
  within(screen.getByRole('alertdialog')).getByText(/you must first deselect/i);
  fireEvent.click(screen.getByText('Okay'));

  // Try to add another write-in when max candidates are selected.
  fireEvent.click(
    screen.getByText('add write-in candidate').closest('button')!
  );
  within(screen.getByRole('alertdialog')).getByText(/you must first deselect/i);
  fireEvent.click(screen.getByText('Okay'));

  // Go to review page and confirm write in exists
  while (!screen.queryByText('Review Your Votes')) {
    fireEvent.click(screen.getByText('Next'));
    advanceTimers();
  }

  // Review Screen
  await screen.findByText('Review Your Votes');
  expect(screen.getByText('SAL')).toBeTruthy();
  expect(screen.getByText(/\(write-in\)/)).toBeTruthy();

  // Print Screen
  apiMock.expectPrintBallot();
  apiMock.expectGetElectionState({ ballotsPrintedCount: 1 });
  fireEvent.click(screen.getByText(/Print My ballot/i));
  advanceTimers();
  screen.getByText(/Printing Your Official Ballot/i);
  await expectPrintToPdf((printedElement) => {
    expect(printedElement.getByText('Official Ballot')).toBeTruthy();
    expect(printedElement.getByText('(write-in)')).toBeTruthy();
  });
});
