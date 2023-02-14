import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  getZeroCompressedTally,
  expectPrint,
  fakeElectionManagerUser,
} from '@votingworks/test-utils';
import {
  MemoryStorage,
  MemoryHardware,
  ReportSourceMachineType,
} from '@votingworks/utils';
import { fakeLogger } from '@votingworks/logging';
import { getContestDistrictName } from '@votingworks/types';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { ok } from '@votingworks/basics';
import * as GLOBALS from './config/globals';

import { App } from './app';

import { withMarkup } from '../test/helpers/with_markup';

import { advanceTimersAndPromises } from '../test/helpers/smartcards';

import {
  presidentContest,
  countyCommissionersContest,
  measure102Contest,
  voterContests,
} from '../test/helpers/election';
import { REPORT_PRINTING_TIMEOUT_SECONDS } from './config/globals';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

jest.setTimeout(15000);

test('MarkAndPrint end-to-end flow', async () => {
  const logger = fakeLogger();
  const electionDefinition = electionSampleDefinition;
  const { electionData, electionHash } = electionDefinition;
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig({
    screenOrientation: 'portrait',
  });
  const expectedElectionHash = electionDefinition.electionHash.substring(0, 10);
  const reload = jest.fn();
  render(
    <App
      hardware={hardware}
      storage={storage}
      reload={reload}
      logger={logger}
      apiClient={apiMock.mockApiClient}
    />
  );
  await advanceTimersAndPromises();
  const getByTextWithMarkup = withMarkup(screen.getByText);
  const findByTextWithMarkup = withMarkup(screen.findByText);

  await advanceTimersAndPromises();

  // Default Unconfigured
  screen.getByText('VxMark is Not Configured');

  // ---------------

  // Insert election manager card and enter incorrect PIN
  apiMock.setAuthStatus({
    status: 'checking_passcode',
    user: fakeElectionManagerUser(electionDefinition),
  });
  await screen.findByText('Enter the card security code to unlock.');
  apiMock.mockApiClient.checkPin
    .expectCallWith({ electionHash: undefined, pin: '111111' })
    .resolves();
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('1'));
  apiMock.setAuthStatus({
    status: 'checking_passcode',
    user: fakeElectionManagerUser({ electionHash }),
    wrongPasscodeEnteredAt: new Date(),
  });
  await screen.findByText('Invalid code. Please try again.');

  // Enter correct PIN
  apiMock.mockApiClient.checkPin
    .expectCallWith({ electionHash: undefined, pin: '123456' })
    .resolves();
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('2'));
  userEvent.click(screen.getByText('3'));
  userEvent.click(screen.getByText('4'));
  userEvent.click(screen.getByText('5'));
  userEvent.click(screen.getByText('6'));
  apiMock.setAuthStatusElectionManagerLoggedIn(electionDefinition);

  // Configure with Election Manager Card
  apiMock.mockApiClient.readElectionDefinitionFromCard
    .expectCallWith({ electionHash: undefined })
    .resolves(ok(electionData));
  userEvent.click(await screen.findByText('Load Election Definition'));

  await advanceTimersAndPromises();
  screen.getByText('Election Definition is loaded.');

  // Remove card and expect not configured because precinct not selected
  apiMock.setAuthStatusLoggedOut();
  await advanceTimersAndPromises();
  await screen.findByText('VxMark is Not Configured');

  // ---------------

  // Configure election with Election Manager Card
  apiMock.setAuthStatusElectionManagerLoggedIn(electionDefinition);
  await screen.findByLabelText('Precinct');
  screen.queryByText(`Election ID: ${expectedElectionHash}`);
  screen.queryByText('Machine ID: 000');

  // Select precinct
  screen.getByText('State of Hamilton');
  userEvent.selectOptions(
    screen.getByLabelText('Precinct'),
    screen.getByText('Center Springfield')
  );
  within(screen.getByTestId('electionInfoBar')).getByText(/Center Springfield/);

  userEvent.click(screen.getByText('Live Election Mode'));
  expect(
    screen.getByText<HTMLButtonElement>('Live Election Mode').disabled
  ).toBeTruthy();

  // Remove card
  apiMock.setAuthStatusLoggedOut();
  await advanceTimersAndPromises();
  await screen.findByText('Polls Closed');
  screen.getByText('Insert Poll Worker card to open.');

  // ---------------

  // Using an invalid Poll Worker Card shows an error
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'poll_worker_wrong_election',
  });
  await advanceTimersAndPromises();
  await screen.findByText('Invalid Card Data');
  screen.getByText('Card is not configured for this election.');
  screen.getByText('Please ask admin for assistance.');
  apiMock.setAuthStatusLoggedOut();
  await advanceTimersAndPromises();

  // ---------------

  // Open Polls with Poll Worker Card
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await advanceTimersAndPromises();
  userEvent.click(await screen.findByText('Open Polls'));
  userEvent.click(screen.getByText('Open Polls on VxMark Now'));
  screen.getByText('Select Voter’s Ballot Style');
  // Force refresh
  userEvent.click(screen.getByText('View More Actions'));
  userEvent.click(screen.getByText('Reset Accessible Controller'));
  expect(reload).toHaveBeenCalledTimes(1);
  await screen.findByText('Close Polls');

  // Remove card
  apiMock.setAuthStatusLoggedOut();
  await advanceTimersAndPromises();
  await screen.findByText('Insert Card');

  // ---------------

  // Complete Voter Happy Path

  // Start voter session
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await advanceTimersAndPromises();
  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ electionHash, ballotStyleId: '12', precinctId: '23' })
    .resolves();
  userEvent.click(await screen.findByText('12'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    isScannerReportDataReadExpected: false,
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId: '23',
    },
  });
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId: '23',
  });
  await advanceTimersAndPromises();

  screen.getByText(/Center Springfield/);
  screen.getByText(/(12)/);
  await findByTextWithMarkup('Your ballot has 20 contests.');

  // Adjust Text Size on Start Page
  expect(
    screen.getAllByLabelText('Text Size:', { exact: false }).length
  ).toEqual(3);
  userEvent.click(screen.getByLabelText('Text Size: Large'));
  expect(window.document.documentElement.style.fontSize).toEqual('36px');
  userEvent.click(screen.getByLabelText('Selected Text Size: Large'));
  expect(window.document.documentElement.style.fontSize).toEqual('36px');
  userEvent.click(screen.getByLabelText('Text Size: Medium'));
  expect(window.document.documentElement.style.fontSize).toEqual('28px');
  userEvent.click(screen.getByLabelText('Text Size: Small'));
  expect(window.document.documentElement.style.fontSize).toEqual('22px');

  // Start Voting
  userEvent.click(screen.getByText('Start Voting'));

  // Adjust Text Size in Settings Modal
  userEvent.click(screen.getByText('Settings'));
  screen.getByText('Voter Settings');
  expect(
    screen.getAllByLabelText('Text Size:', { exact: false }).length
  ).toEqual(3);
  userEvent.keyboard('{ArrowRight}');
  expect(screen.getByLabelText('Selected Text Size: Small')).toHaveFocus();
  userEvent.keyboard('{ArrowRight}');
  expect(screen.getByLabelText('Text Size: Medium')).toHaveFocus();
  userEvent.keyboard('{ArrowLeft}');
  expect(screen.getByLabelText('Selected Text Size: Small')).toHaveFocus();
  userEvent.click(screen.getByLabelText('Text Size: Large'));
  expect(window.document.documentElement.style.fontSize).toEqual('36px');
  userEvent.click(screen.getByText('Done'));
  expect(screen.queryByText('Voter Settings')).not.toBeInTheDocument();
  expect(window.document.documentElement.style.fontSize).toEqual('36px');

  // Use Default Settings
  userEvent.click(screen.getByText('Settings'));
  userEvent.click(screen.getByText('Use Default Settings'));
  expect(screen.queryByText('Voter Settings')).not.toBeInTheDocument();
  expect(window.document.documentElement.style.fontSize).toEqual('28px');

  // Update Settings to use non default text size for voting session
  userEvent.click(screen.getByText('Settings'));
  screen.getByText('Voter Settings');
  userEvent.click(screen.getByLabelText('Text Size: Large'));
  expect(window.document.documentElement.style.fontSize).toEqual('36px');
  userEvent.click(screen.getByText('Done'));

  // Advance through every contest
  for (let i = 0; i < voterContests.length; i += 1) {
    const { title } = voterContests[i];

    await advanceTimersAndPromises();
    screen.getByText(title);

    // Vote for candidate contest
    if (title === presidentContest.title) {
      userEvent.click(screen.getByText(presidentContest.candidates[0].name));
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
  await advanceTimersAndPromises();
  screen.getByText('Review Your Votes');

  // Review Screen has Voter Settings
  userEvent.click(screen.getByText('Settings'));
  screen.getByText('Voter Settings');
  userEvent.click(screen.getByText('Done'));

  // Check for votes
  screen.getByText(presidentContest.candidates[0].name);
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
  await advanceTimersAndPromises();
  screen.getByText(/Vote for 4/i);

  // Select first candidate
  userEvent.click(
    screen.getByText(countyCommissionersContest.candidates[0].name)
  );
  userEvent.click(
    screen.getByText(countyCommissionersContest.candidates[1].name)
  );

  // Back to Review screen
  userEvent.click(screen.getByText('Review'));
  await advanceTimersAndPromises();
  screen.getByText('Review Your Votes');
  screen.getByText(countyCommissionersContest.candidates[0].name);
  screen.getByText(countyCommissionersContest.candidates[1].name);
  screen.getByText('You may still vote for 2 more candidates.');

  // Print Screen
  userEvent.click(getByTextWithMarkup('I’m Ready to Print My Ballot'));
  screen.getByText('Printing Your Official Ballot');
  await expectPrint();

  // Font Size is still custom user setting
  expect(window.document.documentElement.style.fontSize).toEqual('36px');

  // Expire timeout for display of "Printing Ballot" screen
  await advanceTimersAndPromises(GLOBALS.BALLOT_PRINTING_TIMEOUT_SECONDS);

  screen.getByText('You’re Almost Done');
  apiMock.mockApiClient.endCardlessVoterSession
    .expectCallWith({ electionHash })
    .resolves();
  userEvent.click(screen.getByText('Done'));
  apiMock.setAuthStatusLoggedOut();

  // Font size has been reset to default on Insert Card screen
  expect(window.document.documentElement.style.fontSize).toEqual('28px');

  // ---------------

  // Close Polls with Poll Worker Card
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await advanceTimersAndPromises();
  userEvent.click(screen.getByText('View More Actions'));
  userEvent.click(screen.getByText('Close Polls'));
  userEvent.click(screen.getByText('Close Polls on VxMark Now'));

  // Remove card
  apiMock.setAuthStatusLoggedOut();
  await advanceTimersAndPromises();
  await screen.findByText('Voting is complete.');

  // Insert pollworker card with precinct scanner tally
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    scannerReportDataReadResult: ok({
      tally: getZeroCompressedTally(electionDefinition.election),
      tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
      machineId: '0002',
      timeSaved: new Date('2020-10-31').getTime(),
      timePollsTransitioned: new Date('2020-10-31').getTime(),
      precinctSelection: {
        kind: 'SinglePrecinct',
        precinctId: '23',
      },
      totalBallotsScanned: 10,
      isLiveMode: true,
      pollsTransition: 'close_polls',
      ballotCounts: {
        'undefined--ALL_PRECINCTS': [5, 5],
        'undefined--23': [5, 5],
      },
    }),
  });
  await advanceTimersAndPromises();
  await screen.findByText('Polls Closed Report on Card');
  apiMock.mockApiClient.clearScannerReportDataFromCard
    .expectCallWith({ electionHash })
    .resolves(ok());
  userEvent.click(screen.getByText('Print Report'));
  await advanceTimersAndPromises();
  screen.getByText('Printing polls closed report');
  await advanceTimersAndPromises(REPORT_PRINTING_TIMEOUT_SECONDS);
  await expectPrint();
  userEvent.click(await screen.findByText('Continue'));

  apiMock.setAuthStatusLoggedOut();
  await advanceTimersAndPromises();

  // Insert System Administrator card
  apiMock.setAuthStatusSystemAdministratorLoggedIn();
  await screen.findByText('Reboot from USB');
  apiMock.setAuthStatusLoggedOut();
  await advanceTimersAndPromises();

  // ---------------

  // Unconfigure with Election Manager Card
  apiMock.setAuthStatusElectionManagerLoggedIn(electionDefinition);
  await screen.findByText('Election Definition is loaded.');
  userEvent.click(screen.getByText('Unconfigure Machine'));
  await advanceTimersAndPromises();

  // Default Unconfigured
  apiMock.setAuthStatusLoggedOut();
  await advanceTimersAndPromises();
  await screen.findByText('VxMark is Not Configured');

  // Insert System Administrator card works when unconfigured
  apiMock.setAuthStatusSystemAdministratorLoggedIn();
  await screen.findByText('Reboot from USB');
  apiMock.setAuthStatusLoggedOut();
  await advanceTimersAndPromises();

  // ---------------

  // Configure with Election Manager card
  apiMock.setAuthStatusElectionManagerLoggedIn(electionDefinition);
  apiMock.mockApiClient.readElectionDefinitionFromCard
    .expectCallWith({ electionHash: undefined })
    .resolves(ok(electionData));
  userEvent.click(
    await screen.findByRole('button', { name: 'Load Election Definition' })
  );
  await screen.findByText('Election Definition is loaded.');
  apiMock.setAuthStatusLoggedOut();
  await advanceTimersAndPromises();
  await screen.findByText('Insert Election Manager card to select a precinct.');

  // Unconfigure with System Administrator card
  apiMock.setAuthStatusSystemAdministratorLoggedIn();
  userEvent.click(
    await screen.findByRole('button', { name: 'Unconfigure Machine' })
  );
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(
    within(modal).getByRole('button', {
      name: 'Yes, Delete Election Data',
    })
  );
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  apiMock.setAuthStatusLoggedOut();
  await advanceTimersAndPromises();
  await screen.findByText('VxMark is Not Configured');

  // Verify that machine was unconfigured
  apiMock.setAuthStatusElectionManagerLoggedIn(electionDefinition);
  await screen.findByText('Election Definition is not loaded.');
});
