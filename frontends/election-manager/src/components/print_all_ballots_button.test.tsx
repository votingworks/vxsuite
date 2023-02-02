import fetchMock from 'fetch-mock';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import { MemoryHardware } from '@votingworks/utils';
import { typedAs } from '@votingworks/basics';
import React from 'react';
import { Admin } from '@votingworks/api';
import {
  expectPrint,
  fakeKiosk,
  fakePrinter,
  hasTextAcrossElements,
  simulateErrorOnNextPrint,
} from '@votingworks/test-utils';
import { BallotStyleId } from '@votingworks/types';
import {
  renderInAppContext,
  renderRootElement,
} from '../../test/render_in_app_context';
import {
  authenticateAsElectionManager,
  authenticateAsSystemAdministrator,
  logOut,
} from '../../test/util/authenticate';
import { App } from '../app';
import {
  PrintAllBallotsButton,
  PRINTER_WARMUP_TIME,
  TWO_SIDED_PRINT_TIME,
} from './print_all_ballots_button';
import { MachineConfig } from '../config/types';
import { ElectionManagerStoreMemoryBackend } from '../lib/backends';
import { createMockApiClient, MockApiClient } from '../../test/helpers/api';

jest.mock('../components/hand_marked_paper_ballot');

fetchMock.get(
  '/machine-config',
  typedAs<MachineConfig>({
    machineId: '0000',
    codeVersion: 'TEST',
  })
);

let mockApiClient: MockApiClient;

beforeEach(() => {
  jest.useFakeTimers();
  mockApiClient = createMockApiClient();
});

afterEach(() => {
  mockApiClient.assertComplete();
});

test('button renders properly when not clicked', () => {
  renderInAppContext(<PrintAllBallotsButton />);

  expect(screen.queryByText('Print All')).toHaveProperty('type', 'button');
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('modal shows "No Printer Detected" if no printer attached', async () => {
  renderInAppContext(<PrintAllBallotsButton />, { hasPrinterAttached: false });

  userEvent.click(screen.getByText('Print All'));

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('No Printer Detected');
  userEvent.click(within(modal).getByText('Cancel'));

  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('modal allows editing print options', async () => {
  renderInAppContext(<PrintAllBallotsButton />, {
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
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
  const backend = new ElectionManagerStoreMemoryBackend();
  await backend.configure(
    electionMinimalExhaustiveSampleDefinition.electionData
  );
  renderInAppContext(<PrintAllBallotsButton />, {
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
    printer,
    logger,
    backend,
  });

  userEvent.click(screen.getByText('Print All'));

  const modal = await screen.findByRole('alertdialog');
  userEvent.click(
    within(modal).getByText(
      hasTextAcrossElements('Print 4 Official Absentee Ballots')
    )
  );

  const expectedBallotStyles: Array<[string, BallotStyleId]> = [
    ['Precinct 1', '1M'],
    ['Precinct 1', '2F'],
    ['Precinct 2', '1M'],
    ['Precinct 2', '2F'],
  ];

  for (const [i, expectedBallotStyle] of expectedBallotStyles.entries()) {
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
    const printedBallots = await backend.loadPrintedBallots();
    expect(printedBallots).toHaveLength(i + 1);
    expect(printedBallots[printedBallots.length - 1]).toEqual(
      expect.objectContaining(
        typedAs<Partial<Admin.PrintedBallotRecord>>({
          numCopies: 1,
        })
      )
    );
    jest.advanceTimersByTime(TWO_SIDED_PRINT_TIME + PRINTER_WARMUP_TIME);
  }

  await waitFor(() => {
    expect(modal).not.toBeInTheDocument();
  });
});

test('initial modal state toggles based on printer state', async () => {
  const hardware = MemoryHardware.build({
    connectCardReader: true,
  });
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
  });
  renderRootElement(<App hardware={hardware} />, {
    apiClient: mockApiClient,
    backend,
  });

  await authenticateAsElectionManager(
    mockApiClient,
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
  const hardware = MemoryHardware.build({
    connectCardReader: true,
    connectPrinter: true,
  });
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
  });
  const logger = fakeLogger();
  renderRootElement(<App hardware={hardware} />, {
    apiClient: mockApiClient,
    backend,
    logger,
  });

  await authenticateAsElectionManager(
    mockApiClient,
    electionMinimalExhaustiveSampleDefinition
  );
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
  const hardware = MemoryHardware.build({
    connectCardReader: true,
    connectPrinter: true,
  });
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
  });
  renderRootElement(<App hardware={hardware} />, {
    apiClient: mockApiClient,
    backend,
  });

  await authenticateAsElectionManager(
    mockApiClient,
    electionMinimalExhaustiveSampleDefinition
  );
  userEvent.click(await screen.findByText('Print All'));
  let modal = await screen.findByRole('alertdialog');
  within(modal).getByText(
    hasTextAcrossElements('Print 4 Official Absentee Ballots')
  );
  userEvent.click(within(modal).getByText('Cancel'));

  const electionManagerOptions = ['Official', 'Test', 'Sample'];

  await logOut(mockApiClient);
  await authenticateAsSystemAdministrator(mockApiClient);
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

  await logOut(mockApiClient);
  await authenticateAsElectionManager(
    mockApiClient,
    electionMinimalExhaustiveSampleDefinition
  );
  userEvent.click(await screen.findByText('Print All'));
  modal = await screen.findByRole('alertdialog');
  within(modal).getByText(
    hasTextAcrossElements('Print 4 Official Absentee Ballots')
  );
  for (const electionManagerOption of electionManagerOptions) {
    within(modal).getByText(electionManagerOption);
  }
});
