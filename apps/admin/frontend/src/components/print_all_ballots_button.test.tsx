import React from 'react';
import fetchMock from 'fetch-mock';
import userEvent from '@testing-library/user-event';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import { typedAs } from '@votingworks/basics';
import {
  expectPrint,
  fakeKiosk,
  fakePrinter,
  hasTextAcrossElements,
  simulateErrorOnNextPrint,
} from '@votingworks/test-utils';
import { BallotStyleId, PrecinctId } from '@votingworks/types';
import { Admin } from '@votingworks/api';
import { act, screen, waitFor, within } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import {
  PrintAllBallotsButton,
  PRINTER_WARMUP_TIME,
  TWO_SIDED_PRINT_TIME,
} from './print_all_ballots_button';
import { MachineConfig } from '../config/types';
import { createApiMock, ApiMock } from '../../test/helpers/api_mock';
import { buildApp } from '../../test/helpers/build_app';

jest.mock('../components/hand_marked_paper_ballot');

fetchMock.get(
  '/machine-config',
  typedAs<MachineConfig>({
    machineId: '0000',
    codeVersion: 'TEST',
  })
);

let apiMock: ApiMock;

const electionDefinition = electionMinimalExhaustiveSampleDefinition;

beforeEach(() => {
  jest.useFakeTimers();
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('button renders properly when not clicked', () => {
  renderInAppContext(<PrintAllBallotsButton />, { apiMock });

  screen.getButton('Print All');
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('modal shows "No Printer Detected" if no printer attached', async () => {
  renderInAppContext(<PrintAllBallotsButton />, {
    hasPrinterAttached: false,
    apiMock,
  });

  userEvent.click(screen.getByText('Print All'));

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('No Printer Detected');
  userEvent.click(within(modal).getByText('Cancel'));

  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('modal allows editing print options', async () => {
  renderInAppContext(<PrintAllBallotsButton />, {
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
    apiMock,
  });

  userEvent.click(screen.getByText('Print All'));

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('Print All Ballot Styles');
  within(modal).getByText(
    hasTextAcrossElements('Print 4 Official Absentee Ballots')
  );
  userEvent.click(within(modal).getByText('Precinct'));
  userEvent.click(within(modal).getByText('Test'));
  userEvent.click(within(modal).getByText('Sample'));
  within(modal).getByText(
    hasTextAcrossElements('Print 4 Sample Precinct Ballots')
  );
  userEvent.type(within(modal).getByRole('spinbutton'), '{backspace}3');
  within(modal).getByText(
    hasTextAcrossElements('Print 12 Sample Precinct Ballots')
  );
});

test('print sequence proceeds as expected', async () => {
  const printer = fakePrinter();
  const logger = fakeLogger();
  renderInAppContext(<PrintAllBallotsButton />, {
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
    printer,
    logger,
    apiMock,
  });

  userEvent.click(screen.getByText('Print All'));

  const modal = await screen.findByRole('alertdialog');
  userEvent.click(
    within(modal).getByText(
      hasTextAcrossElements('Print 4 Official Absentee Ballots')
    )
  );

  const expectedBallotStyles: Array<[string, BallotStyleId, PrecinctId]> = [
    ['Precinct 1', '1M', 'precinct-1'],
    ['Precinct 1', '2F', 'precinct-1'],
    ['Precinct 2', '1M', 'precinct-2'],
    ['Precinct 2', '2F', 'precinct-2'],
  ];

  for (const [i, expectedBallotStyle] of expectedBallotStyles.entries()) {
    apiMock.expectAddPrintedBallot({
      ballotStyleId: expectedBallotStyle[1],
      precinctId: expectedBallotStyle[2],
      locales: { primary: 'en-US' },
      numCopies: 1,
      ballotType: 'absentee',
      ballotMode: Admin.BallotMode.Official,
    });
    await within(modal).findByText(`Printing Official Ballot (${i + 1} of 4)`);
    within(modal).getByText(
      hasTextAcrossElements(
        `Precinct: ${expectedBallotStyle[0]}, Ballot Style: ${expectedBallotStyle[1]}`
      )
    );
    await expectPrint((printedElement, printOptions) => {
      printedElement.getByText('Mocked HMPB');
      printedElement.getByText(`Ballot Style: ${expectedBallotStyle[1]}`);
      printedElement.getByText(`Precinct: ${expectedBallotStyle[0]}`);
      expect(printOptions).toMatchObject({
        sides: 'two-sided-long-edge',
        copies: 1,
      });
    });

    expect(logger.log).toHaveBeenCalledTimes(i + 1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.BallotPrinted,
      'election_manager',
      expect.objectContaining({
        disposition: 'success',
      })
    );
    jest.advanceTimersByTime(TWO_SIDED_PRINT_TIME + PRINTER_WARMUP_TIME);
  }

  await waitFor(() => {
    expect(modal).not.toBeInTheDocument();
  });
});

test('initial modal state toggles based on printer state', async () => {
  const { renderApp, hardware } = buildApp(apiMock);
  // Set default auth status to logged out.
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetCastVoteRecords([]);
  hardware.setPrinterConnected(false);
  renderApp();

  await apiMock.authenticateAsElectionManager(
    electionMinimalExhaustiveSampleDefinition
  );
  await screen.findByText('Print All');
  userEvent.click(screen.getByText('Print All'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('No Printer Detected');

  act(() => hardware.setPrinterConnected(true));
  await within(modal).findByText('Print All Ballot Styles');

  act(() => hardware.setPrinterConnected(false));
  await within(modal).findByText('No Printer Detected');
});

test('modal shows "Printer Disconnected" if printer disconnected while printing', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  const { renderApp, hardware, logger } = buildApp(apiMock);
  // Set default auth status to logged out.
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetCastVoteRecords([]);
  renderApp();

  await apiMock.authenticateAsElectionManager(electionDefinition);
  apiMock.expectAddPrintedBallot({
    ballotStyleId: '1M',
    precinctId: 'precinct-1',
    locales: { primary: 'en-US' },
    numCopies: 1,
    ballotType: 'absentee',
    ballotMode: Admin.BallotMode.Official,
  });
  userEvent.click(await screen.findByText('Print All'));
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(
    within(modal).getByText(
      hasTextAcrossElements('Print 4 Official Absentee Ballots')
    )
  );
  await within(modal).findByText('Printing Official Ballot (1 of 4)');
  await expectPrint();
  act(() => hardware.setPrinterConnected(false));
  simulateErrorOnNextPrint();
  jest.advanceTimersByTime(TWO_SIDED_PRINT_TIME + PRINTER_WARMUP_TIME);
  await within(modal).findByText('Printer Disconnected');
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.BallotPrinted,
    'election_manager',
    expect.objectContaining({
      message: expect.stringContaining('Failed to print ballots'),
    })
  );

  delete window.kiosk;
});

test('modal is different for system administrators', async () => {
  const { renderApp } = buildApp(apiMock);
  // Set default auth status to logged out.
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetCastVoteRecords([]);
  renderApp();

  await apiMock.authenticateAsElectionManager(electionDefinition);
  userEvent.click(await screen.findByText('Print All'));
  let modal = await screen.findByRole('alertdialog');
  within(modal).getByText(
    hasTextAcrossElements('Print 4 Official Absentee Ballots')
  );
  userEvent.click(within(modal).getByText('Cancel'));

  const electionManagerOptions = ['Official', 'Test', 'Sample'];

  await apiMock.logOut();
  await apiMock.authenticateAsSystemAdministrator();
  userEvent.click(await screen.findByText('Print All'));
  modal = await screen.findByRole('alertdialog');
  within(modal).getByText(
    hasTextAcrossElements('Print 5 Sample Absentee Ballots')
  );
  for (const electionManagerOption of electionManagerOptions) {
    expect(
      within(modal).queryByText(electionManagerOption)
    ).not.toBeInTheDocument();
  }
  userEvent.click(within(modal).getByText('Cancel'));

  await apiMock.logOut();
  await apiMock.authenticateAsElectionManager(electionDefinition);
  userEvent.click(await screen.findByText('Print All'));
  modal = await screen.findByRole('alertdialog');
  within(modal).getByText(
    hasTextAcrossElements('Print 4 Official Absentee Ballots')
  );
  for (const electionManagerOption of electionManagerOptions) {
    within(modal).getByText(electionManagerOption);
  }
});
