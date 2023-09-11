import userEvent from '@testing-library/user-event';
import {
  fakeElectionManagerUser,
  fakeKiosk,
  expectPrintToPdf,
} from '@votingworks/test-utils';
import {
  MemoryStorage,
  MemoryHardware,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { fakeLogger } from '@votingworks/logging';
import { getContestDistrictName } from '@votingworks/types';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { assert } from '@votingworks/basics';
import { render, screen, waitFor, within } from '../test/react_testing_library';

import { App } from './app';

import { withMarkup } from '../test/helpers/with_markup';

import { advanceTimersAndPromises } from '../test/helpers/timers';

import {
  presidentContest,
  countyCommissionersContest,
  measure102Contest,
  voterContests,
} from '../test/helpers/election';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import { configureFromUsbThenRemove } from '../test/helpers/ballot_package';
import { getMockInterpretation } from '../test/helpers/interpretation';

let apiMock: ApiMock;
let kiosk = fakeKiosk();

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
  kiosk = fakeKiosk();
  window.kiosk = kiosk;
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

jest.setTimeout(40_000);

test('MarkAndPrint end-to-end flow', async () => {
  const logger = fakeLogger();
  const electionDefinition = electionGeneralDefinition;
  const { electionHash } = electionDefinition;
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig({
    screenOrientation: 'portrait',
  });
  apiMock.expectSetAcceptingPaperState();
  apiMock.expectGetPrecinctSelection();
  const expectedElectionHash = electionDefinition.electionHash.substring(0, 10);
  const reload = jest.fn();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionDefinition(null);
  render(
    <App
      hardware={hardware}
      storage={storage}
      reload={reload}
      logger={logger}
      apiClient={apiMock.mockApiClient}
    />
  );
  const getByTextWithMarkup = withMarkup(screen.getByText);
  const findByTextWithMarkup = withMarkup(screen.findByText);

  // Default Unconfigured
  await screen.findByText('VxMarkScan is Not Configured');

  // ---------------

  // Insert election manager card and enter incorrect PIN
  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: fakeElectionManagerUser(electionDefinition),
  });
  await screen.findByText('Enter the card PIN to unlock.');
  apiMock.mockApiClient.checkPin.expectCallWith({ pin: '111111' }).resolves();
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: fakeElectionManagerUser({ electionHash }),
    wrongPinEnteredAt: new Date(),
  });
  await screen.findByText('Incorrect PIN. Please try again.');

  // Enter correct PIN
  apiMock.mockApiClient.checkPin.expectCallWith({ pin: '123456' }).resolves();
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('2'));
  userEvent.click(screen.getByText('3'));
  userEvent.click(screen.getByText('4'));
  userEvent.click(screen.getByText('5'));
  userEvent.click(screen.getByText('6'));
  apiMock.setAuthStatusElectionManagerLoggedIn(electionDefinition);

  // Configure with USB
  await configureFromUsbThenRemove(apiMock, kiosk, screen, electionDefinition);
  await screen.findByText('Election Definition is loaded.');

  // Remove card and expect not configured because precinct not selected
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('VxMarkScan is Not Configured');

  // ---------------

  // Configure election with Election Manager Card
  apiMock.setAuthStatusElectionManagerLoggedIn(electionDefinition);
  await screen.findByLabelText('Precinct');
  screen.queryByText(`Election ID: ${expectedElectionHash}`);
  screen.queryByText('Machine ID: 000');

  // Select precinct
  screen.getByText('State of Hamilton');
  const precinctName = 'Center Springfield';
  const precinct = electionDefinition.election.precincts.find(
    (_precinct) => _precinct.name === precinctName
  );
  assert(precinct, `Expected to find a precinct for ${precinctName}`);
  const precinctSelection = singlePrecinctSelectionFor(precinct.id);
  // TODO(kevin)
  // This set operation is called twice with the same value. Not a risk
  // but we should figure out why when time allows.
  apiMock.expectSetPrecinctSelectionRepeated(precinctSelection);
  // Expect one call for each rerender from here
  apiMock.expectGetPrecinctSelection(precinctSelection);
  userEvent.selectOptions(
    screen.getByLabelText('Precinct'),
    screen.getByText(precinctName)
  );
  await advanceTimersAndPromises();
  await within(screen.getByTestId('electionInfoBar')).findByText(
    /Center Springfield/
  );

  apiMock.expectGetPrecinctSelection(precinctSelection);
  userEvent.click(
    screen.getByRole('option', {
      name: 'Official Ballot Mode',
      selected: false,
    })
  );

  screen.getByRole('option', { name: 'Official Ballot Mode', selected: true });

  // Remove card
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Polls Closed');
  screen.getByText('Insert Poll Worker card to open.');

  // ---------------

  // Using an invalid Poll Worker Card shows an error
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'poll_worker_wrong_election',
  });
  await screen.findByText('Invalid Card Data');
  screen.getByText('Card is not configured for this election.');
  screen.getByText('Please ask admin for assistance.');
  apiMock.setAuthStatusLoggedOut();

  // ---------------

  // Open Polls with Poll Worker Card
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  userEvent.click(await screen.findByText('Open Polls'));
  userEvent.click(
    within(await screen.findByRole('alertdialog')).getByText('Open Polls')
  );
  screen.getByText('Select Voter’s Ballot Style');
  // Force refresh
  userEvent.click(screen.getByText('View More Actions'));
  userEvent.click(screen.getByText('Reset Accessible Controller'));
  expect(reload).toHaveBeenCalledTimes(1);
  await screen.findByText('Close Polls');

  // Remove card
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Insert Card');

  // ---------------

  // Complete Voter Happy Path

  // Start voter session
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ ballotStyleId: '12', precinctId: '23' })
    .resolves();
  userEvent.click(await screen.findByText('12'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId: '23',
    },
  });
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId: '23',
  });

  await findByTextWithMarkup('Your ballot has 20 contests.');
  screen.getByText(/Center Springfield/);
  screen.getByText(/(12)/);

  // Start Voting
  userEvent.click(screen.getByText('Start Voting'));

  const presidentCandidateToVoteFor = presidentContest.candidates[0];

  // Advance through every contest
  for (let i = 0; i < voterContests.length; i += 1) {
    const { title } = voterContests[i];

    await screen.findByText(title);

    // Vote for candidate contest
    if (title === presidentContest.title) {
      userEvent.click(screen.getByText(presidentCandidateToVoteFor.name));
    }

    // Vote for yesno contest
    else if (title === measure102Contest.title) {
      userEvent.click(
        within(screen.getByTestId('contest-choices')).getByText('Yes')
      );
    }

    userEvent.click(screen.getByText('Next'));
  }

  // Review Screen
  await screen.findByText('Review Your Votes');

  // Check for votes
  screen.getByText(presidentCandidateToVoteFor.name);
  within(screen.getByText(measure102Contest.title).parentElement!).getByText(
    'Yes'
  );

  // Change "County Commissioners" Contest
  userEvent.click(
    getByTextWithMarkup(
      `${getContestDistrictName(
        electionDefinition.election,
        countyCommissionersContest
      )}${countyCommissionersContest.title}`
    )
  );
  await screen.findByText(/Vote for 4/i);

  // Select first candidate
  userEvent.click(
    screen.getByText(countyCommissionersContest.candidates[0].name)
  );
  userEvent.click(
    screen.getByText(countyCommissionersContest.candidates[1].name)
  );

  // Back to Review screen
  userEvent.click(screen.getByText('Review'));
  await screen.findByText('Review Your Votes');
  screen.getByText(countyCommissionersContest.candidates[0].name);
  screen.getByText(countyCommissionersContest.candidates[1].name);
  screen.getByText('You may still vote for 2 more candidates.');

  // Print Screen
  apiMock.expectPrintBallot();
  userEvent.click(screen.getByText(/Print My ballot/i));
  screen.getByText(/Printing Your Official Ballot/i);
  await expectPrintToPdf();

  const mockInterpretation = getMockInterpretation(electionDefinition);
  apiMock.expectGetInterpretation(mockInterpretation);
  apiMock.setPaperHandlerState('presenting_ballot');
  // Validate Ballot page
  await screen.findByText('Review Your Votes');
  apiMock.expectValidateBallot();
  apiMock.mockApiClient.endCardlessVoterSession.expectCallWith().resolves();
  apiMock.expectGetInterpretation(mockInterpretation);
  userEvent.click(screen.getByText('My Ballot is Correct'));
  userEvent.click(await screen.findByText('Done'));
  apiMock.setAuthStatusLoggedOut();

  // ---------------

  // Close Polls with Poll Worker Card
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  userEvent.click(await screen.findByText('View More Actions'));
  userEvent.click(screen.getByText('Close Polls'));
  userEvent.click(
    within(await screen.findByRole('alertdialog')).getByText('Close Polls')
  );

  // Remove card
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Voting is complete.');

  // Insert System Administrator card
  apiMock.setAuthStatusSystemAdministratorLoggedIn();
  await screen.findByText('Reboot from USB');
  apiMock.setAuthStatusLoggedOut();

  // ---------------

  // Unconfigure with Election Manager Card
  apiMock.setAuthStatusElectionManagerLoggedIn(electionDefinition);
  await screen.findByText('Election Definition is loaded.');

  // Unconfigure the machine
  apiMock.expectUnconfigureMachine();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionDefinition(null);
  apiMock.expectGetPrecinctSelection();
  userEvent.click(screen.getByText('Unconfigure Machine'));

  // Default Unconfigured
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('VxMarkScan is Not Configured');

  // Insert System Administrator card works when unconfigured
  apiMock.setAuthStatusSystemAdministratorLoggedIn();
  await screen.findByText('Reboot from USB');
  apiMock.setAuthStatusLoggedOut();

  // ---------------

  // Configure with Election Manager card and USB
  apiMock.setAuthStatusElectionManagerLoggedIn(electionDefinition);
  await configureFromUsbThenRemove(apiMock, kiosk, screen, electionDefinition);

  await screen.findByText('Election Definition is loaded.');
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Insert Election Manager card to select a precinct.');

  // Unconfigure with System Administrator card
  apiMock.setAuthStatusSystemAdministratorLoggedIn();
  userEvent.click(
    await screen.findByRole('button', { name: 'Unconfigure Machine' })
  );
  const modal = await screen.findByRole('alertdialog');
  apiMock.expectUnconfigureMachine();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionDefinition(null);
  apiMock.expectGetPrecinctSelection();
  userEvent.click(
    within(modal).getByRole('button', {
      name: 'Yes, Delete Election Data',
    })
  );
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('VxMarkScan is Not Configured');

  // Verify that machine was unconfigured even after election manager reauth
  apiMock.setAuthStatusElectionManagerLoggedIn(electionDefinition);
  await screen.findByText('VxMarkScan is Not Configured');
});
