import userEvent from '@testing-library/user-event';
import {
  mockElectionManagerUser,
  hasTextAcrossElements,
} from '@votingworks/test-utils';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import {
  BallotStyleId,
  LanguageCode,
  constructElectionKey,
  getContestDistrictName,
} from '@votingworks/types';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { assert } from '@votingworks/basics';
import { render, screen, waitFor, within } from '../test/react_testing_library';

import { App } from './app';

import { withMarkup } from '../test/helpers/with_markup';

import {
  presidentContest,
  countyCommissionersContest,
  measure102Contest,
  voterContests,
} from '../test/helpers/election';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import { configureFromUsbThenRemove } from '../test/helpers/election_package';
import { getMockInterpretation } from '../test/helpers/interpretation';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

jest.setTimeout(60_000);

test('MarkAndPrint end-to-end flow', async () => {
  const electionDefinition = electionGeneralDefinition;
  const electionKey = constructElectionKey(electionDefinition.election);
  apiMock.expectGetMachineConfig({
    screenOrientation: 'portrait',
  });
  apiMock.setPaperHandlerState('not_accepting_paper');
  const expectedBallotHash = electionDefinition.ballotHash.substring(0, 10);
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(null);
  apiMock.expectGetElectionState();
  render(<App apiClient={apiMock.mockApiClient} />);
  const getByTextWithMarkup = withMarkup(screen.getByText);
  const findByTextWithMarkup = withMarkup(screen.findByText);

  // Default Unconfigured
  await screen.findByText(
    'Insert an election manager card to configure VxMark'
  );

  // ---------------

  // Insert election manager card and enter incorrect PIN
  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: mockElectionManagerUser({ electionKey }),
  });
  await screen.findByText('Enter the card PIN');
  apiMock.mockApiClient.checkPin.expectCallWith({ pin: '111111' }).resolves();
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: mockElectionManagerUser({ electionKey }),
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
  await configureFromUsbThenRemove(apiMock, screen, electionDefinition);
  await screen.findByText('Election Definition is loaded.');

  // Remove card and expect not configured because precinct not selected
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText(
    'Insert an election manager card to configure VxMark'
  );

  // ---------------

  // Configure election with election manager card
  apiMock.setAuthStatusElectionManagerLoggedIn(electionDefinition);
  await screen.findByLabelText('Select a precinct…');
  screen.queryByText(`Election ID: ${expectedBallotHash}`);
  screen.queryByText('Machine ID: 000');

  // Select precinct
  screen.getByText('State of Hamilton');
  const precinctName = 'Center Springfield';
  const precinct = electionDefinition.election.precincts.find(
    (_precinct) => _precinct.name === precinctName
  );
  assert(precinct, `Expected to find a precinct for ${precinctName}`);
  const precinctSelection = singlePrecinctSelectionFor(precinct.id);
  apiMock.expectSetPrecinctSelection(precinctSelection);
  apiMock.expectGetElectionState({
    precinctSelection,
  });
  userEvent.click(screen.getByText('Select a precinct…'));
  userEvent.click(screen.getByText(precinctName));
  await within(screen.getByTestId('electionInfoBar')).findByText(
    /Center Springfield/
  );

  apiMock.expectSetTestMode(false);
  apiMock.expectGetElectionState({
    isTestMode: false,
  });
  userEvent.click(
    screen.getByRole('option', {
      name: 'Official Ballot Mode',
      selected: false,
    })
  );

  await screen.findByRole('option', {
    name: 'Official Ballot Mode',
    selected: true,
  });

  // Remove card
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Polls Closed');
  screen.getByText('Insert poll worker card to open.');

  // ---------------

  // Using an invalid poll worker card shows an error
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'wrong_election',
    cardUserRole: 'poll_worker',
  });
  await screen.findByText('Invalid Card');
  screen.getByText(
    /The inserted poll worker card is programmed for another election and cannot be used to unlock this machine./
  );
  screen.getByText(/Remove the card to continue./);
  apiMock.setAuthStatusLoggedOut();

  // ---------------

  // Open Polls with poll worker card
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  apiMock.expectSetPollsState('polls_open');
  apiMock.expectGetElectionState({ pollsState: 'polls_open' });
  userEvent.click(await screen.findByText('Open Polls'));
  userEvent.click(
    within(await screen.findByRole('alertdialog')).getByText('Open Polls')
  );
  await screen.findByText('Select Voter’s Ballot Style');

  // Close polls:
  userEvent.click(screen.getByText('View More Actions'));
  await screen.findByText('Close Polls');

  // Remove card
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Insert Card');

  // ---------------

  // Complete Voter Happy Path

  // Start voter session
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ ballotStyleId: '12' as BallotStyleId, precinctId: '23' })
    .resolves();
  apiMock.expectSetAcceptingPaperState();
  userEvent.click(await screen.findByText('12'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12' as BallotStyleId,
      precinctId: '23',
    },
  });
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12' as BallotStyleId,
    precinctId: '23',
  });
  apiMock.setPaperHandlerState('waiting_for_ballot_data');

  await findByTextWithMarkup('Number of contests on your ballot: 20');
  screen.getByText(/Center Springfield/);
  screen.getByText(/(12)/);

  // Start Voting
  userEvent.click(screen.getByText('Start Voting'));

  const presidentCandidateToVoteFor = presidentContest.candidates[0];

  // Advance through every contest
  for (let i = 0; i < voterContests.length; i += 1) {
    const { title } = voterContests[i];

    await screen.findByRole('heading', { name: title });

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
  within(
    screen.getByRole('heading', { name: new RegExp(measure102Contest.title) })
      .parentElement!
  ).getByText('Yes');

  // Change "County Commissioners" Contest
  userEvent.click(
    getByTextWithMarkup(
      `${getContestDistrictName(
        electionDefinition.election,
        countyCommissionersContest
      )}${countyCommissionersContest.title}`
    )
  );
  await screen.findByText(
    hasTextAcrossElements(/votes remaining in this contest: 4/i)
  );

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
  screen.getByText(hasTextAcrossElements(/number of unused votes: 2/i));

  // Print Screen
  apiMock.expectPrintBallot({
    languageCode: LanguageCode.ENGLISH,
    precinctId: '23',
    ballotStyleId: '12' as BallotStyleId,
    votes: {
      [presidentContest.id]: [presidentCandidateToVoteFor],
      [measure102Contest.id]: [measure102Contest.yesOption.id],
      [countyCommissionersContest.id]: [
        countyCommissionersContest.candidates[0],
        countyCommissionersContest.candidates[1],
      ],
    },
  });
  apiMock.expectGetElectionState({ ballotsPrintedCount: 1 });
  userEvent.click(screen.getByText(/Print My ballot/i));
  screen.getByText(/Printing Your Official Ballot/i);

  const mockInterpretation = getMockInterpretation(electionDefinition);
  apiMock.expectGetInterpretation(mockInterpretation);
  apiMock.setPaperHandlerState('presenting_ballot');
  // Validate Ballot page
  await screen.findByText('Review Your Votes');
  apiMock.expectValidateBallot();
  apiMock.expectGetInterpretation(mockInterpretation);
  userEvent.click(screen.getByText('Cast My Ballot'));

  apiMock.setAuthStatusLoggedOut();
  apiMock.setPaperHandlerState('not_accepting_paper');

  // ---------------

  // Close Polls with poll worker card
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  apiMock.expectSetPollsState('polls_closed_final');
  apiMock.expectGetElectionState({ pollsState: 'polls_closed_final' });
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
  await screen.findByText('System Administrator Menu');
  apiMock.setAuthStatusLoggedOut();

  // ---------------

  // Unconfigure with election manager card
  apiMock.setAuthStatusElectionManagerLoggedIn(electionDefinition);
  await screen.findByText('Election Definition is loaded.');

  // Unconfigure the machine
  apiMock.expectUnconfigureMachine();
  apiMock.expectGetMachineConfig({
    screenOrientation: 'portrait',
  });
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(null);
  apiMock.expectGetElectionState();
  apiMock.expectEjectUsbDrive();
  userEvent.click(screen.getByText('Unconfigure Machine'));
  userEvent.click(screen.getButton('Delete All Election Data'));

  // Default Unconfigured
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText(
    'Insert an election manager card to configure VxMark'
  );

  // Insert System Administrator card works when unconfigured
  apiMock.setAuthStatusSystemAdministratorLoggedIn();
  await screen.findByText('System Administrator Menu');
  apiMock.setAuthStatusLoggedOut();

  // ---------------

  // Configure with election manager card and USB
  apiMock.setAuthStatusElectionManagerLoggedIn(electionDefinition);
  await configureFromUsbThenRemove(apiMock, screen, electionDefinition);

  await screen.findByText('Election Definition is loaded.');
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText(
    'Insert an election manager card to configure VxMark'
  );

  // Unconfigure with System Administrator card
  apiMock.setAuthStatusSystemAdministratorLoggedIn();
  userEvent.click(await screen.findByText('Unconfigure Machine'));
  const modal = await screen.findByRole('alertdialog');
  apiMock.expectUnconfigureMachine();
  apiMock.expectGetMachineConfig({
    screenOrientation: 'portrait',
  });
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(null);
  apiMock.expectGetElectionState();
  userEvent.click(
    within(modal).getByRole('button', {
      name: 'Delete All Election Data',
    })
  );
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText(
    'Insert an election manager card to configure VxMark'
  );

  // Verify that machine was unconfigured even after election manager reauth
  apiMock.setAuthStatusElectionManagerLoggedIn(electionDefinition);
  await screen.findByText('Insert a USB drive containing an election package');
});
