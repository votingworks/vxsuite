import React, { RefObject } from 'react';
import userEvent from '@testing-library/user-event';
import _ from 'lodash';
import { BallotPaperSize } from '@votingworks/types';
import { electionWithMsEitherNeitherDefinition } from '@votingworks/fixtures';
import { fakeKiosk, fakePrinterInfo } from '@votingworks/test-utils';
import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { Printer } from '@votingworks/utils';
import { screen, waitFor } from '@testing-library/react';

import { fakePrinter } from '../../test/helpers/fake_printer';
import {
  LAST_PRINT_JOB_SLEEP_MS,
  ONE_SIDED_PAGE_PRINT_TIME_MS,
  PrintTestDeckScreen,
  TWO_SIDED_PAGE_PRINT_TIME_MS,
} from './print_test_deck_screen';
import { renderInAppContext } from '../../test/render_in_app_context';

jest.mock('../components/hand_marked_paper_ballot');

let mockKiosk: jest.Mocked<KioskBrowser.Kiosk>;
let mockLogger: Logger;
let mockPrintBallotRef: RefObject<HTMLElement>;
let mockPrinter: jest.Mocked<Printer>;

beforeEach(() => {
  jest.useFakeTimers();
  mockKiosk = fakeKiosk();
  mockKiosk.getPrinterInfo.mockResolvedValue([
    fakePrinterInfo({ connected: true, name: 'VxPrinter' }),
  ]);
  window.kiosk = mockKiosk;
  mockLogger = new Logger(LogSource.VxAdminFrontend, mockKiosk);
  mockPrintBallotRef = {
    current: document.createElement('div'),
  };
  mockPrinter = fakePrinter();
});

afterAll(() => {
  delete window.kiosk;
});

test('Printing L&A package for one precinct', async () => {
  renderInAppContext(<PrintTestDeckScreen />, {
    logger: mockLogger,
    printBallotRef: mockPrintBallotRef,
    printer: mockPrinter,
  });

  userEvent.click(screen.getByText('District 5'));

  const printText = 'Printing L&A Package: District 5';
  await screen.findByText(printText);
  await waitFor(() => expect(mockPrinter.print).toHaveBeenCalledTimes(1));
  expect(mockPrinter.print).toHaveBeenLastCalledWith({ sides: 'one-sided' });
  await waitFor(() =>
    expect(mockKiosk.log).toHaveBeenLastCalledWith(
      expect.stringContaining(LogEventId.TestDeckTallyReportPrinted)
    )
  );
  jest.advanceTimersByTime(ONE_SIDED_PAGE_PRINT_TIME_MS + 1);

  await screen.findByText(printText);
  await waitFor(() => expect(mockPrinter.print).toHaveBeenCalledTimes(2));
  expect(mockPrinter.print).toHaveBeenLastCalledWith({ sides: 'one-sided' });
  await waitFor(() =>
    expect(mockKiosk.log).toHaveBeenLastCalledWith(
      expect.stringContaining(LogEventId.TestDeckPrinted)
    )
  );
  expect(mockKiosk.log).toHaveBeenLastCalledWith(
    expect.stringContaining('BMD paper ballot test deck printed')
  );
  jest.advanceTimersByTime(3 * ONE_SIDED_PAGE_PRINT_TIME_MS + 1);

  await screen.findByText(printText);
  await waitFor(() => expect(mockPrinter.print).toHaveBeenCalledTimes(3));
  expect(mockPrinter.print).toHaveBeenLastCalledWith({
    sides: 'two-sided-long-edge',
  });
  await waitFor(() =>
    expect(mockKiosk.log).toHaveBeenLastCalledWith(
      expect.stringContaining(LogEventId.TestDeckPrinted)
    )
  );
  expect(mockKiosk.log).toHaveBeenLastCalledWith(
    expect.stringContaining('Hand-marked paper ballot test deck printed')
  );
  jest.advanceTimersByTime(LAST_PRINT_JOB_SLEEP_MS + 1);

  await screen.findByText('District 5');
  expect(screen.queryByText('Printing')).not.toBeInTheDocument();
});

test('Printing L&A packages for all precincts', async () => {
  renderInAppContext(<PrintTestDeckScreen />, {
    logger: mockLogger,
    printBallotRef: mockPrintBallotRef,
    printer: mockPrinter,
  });

  userEvent.click(screen.getByText('All Precincts'));

  // Check that the printing modals appear in alphabetical order
  const precinctsInAlphabeticalOrder = [
    'Bywy',
    'Chester',
    'District 5',
    'East Weir',
    'Fentress',
    'French Camp',
    'Hebron',
    'Kenego',
    'Panhandle',
    'Reform',
    'Sherwood',
    'Southwest Ackerman',
    'West Weir',
  ];

  for (const [i, precinct] of precinctsInAlphabeticalOrder.entries()) {
    const printText = `Printing L&A Package (${i + 1} of 13): ${precinct}`;
    await screen.findByText(printText);
    await waitFor(() =>
      expect(mockPrinter.print).toHaveBeenCalledTimes(3 * i + 1)
    );
    expect(mockPrinter.print).toHaveBeenLastCalledWith({ sides: 'one-sided' });
    await waitFor(() =>
      expect(mockKiosk.log).toHaveBeenLastCalledWith(
        expect.stringContaining(LogEventId.TestDeckTallyReportPrinted)
      )
    );
    jest.advanceTimersByTime(ONE_SIDED_PAGE_PRINT_TIME_MS + 1);

    await screen.findByText(printText);
    await waitFor(() =>
      expect(mockPrinter.print).toHaveBeenCalledTimes(3 * i + 2)
    );
    expect(mockPrinter.print).toHaveBeenLastCalledWith({ sides: 'one-sided' });
    await waitFor(() =>
      expect(mockKiosk.log).toHaveBeenLastCalledWith(
        expect.stringContaining(LogEventId.TestDeckPrinted)
      )
    );
    expect(mockKiosk.log).toHaveBeenLastCalledWith(
      expect.stringContaining('BMD paper ballot test deck printed')
    );
    jest.advanceTimersByTime(3 * ONE_SIDED_PAGE_PRINT_TIME_MS + 1);

    await screen.findByText(printText);
    await waitFor(() =>
      expect(mockPrinter.print).toHaveBeenCalledTimes(3 * i + 3)
    );
    expect(mockPrinter.print).toHaveBeenLastCalledWith({
      sides: 'two-sided-long-edge',
    });
    await waitFor(() =>
      expect(mockKiosk.log).toHaveBeenLastCalledWith(
        expect.stringContaining(LogEventId.TestDeckPrinted)
      )
    );
    expect(mockKiosk.log).toHaveBeenLastCalledWith(
      expect.stringContaining('Hand-marked paper ballot test deck printed')
    );
    if (i < precinctsInAlphabeticalOrder.length - 1) {
      jest.advanceTimersByTime(6 * TWO_SIDED_PAGE_PRINT_TIME_MS + 1);
    } else {
      jest.advanceTimersByTime(LAST_PRINT_JOB_SLEEP_MS + 1);
    }
  }

  await screen.findByText('All Precincts');
  expect(screen.queryByText('Printing')).not.toBeInTheDocument();
});

test('Printing L&A package for one precinct, when HMPBs are not letter-size', async () => {
  const electionWithLegalSizeHmpbsDefinition = _.cloneDeep(
    electionWithMsEitherNeitherDefinition
  );
  electionWithLegalSizeHmpbsDefinition.election.ballotLayout!.paperSize =
    BallotPaperSize.Legal;

  renderInAppContext(<PrintTestDeckScreen />, {
    electionDefinition: electionWithLegalSizeHmpbsDefinition,
    logger: mockLogger,
    printBallotRef: mockPrintBallotRef,
    printer: mockPrinter,
  });

  userEvent.click(screen.getByText('District 5'));

  const printText = 'Printing L&A Package: District 5';
  await screen.findByText(printText);
  await waitFor(() => expect(mockPrinter.print).toHaveBeenCalledTimes(1));
  expect(mockPrinter.print).toHaveBeenLastCalledWith({ sides: 'one-sided' });
  await waitFor(() =>
    expect(mockKiosk.log).toHaveBeenLastCalledWith(
      expect.stringContaining(LogEventId.TestDeckTallyReportPrinted)
    )
  );
  jest.advanceTimersByTime(ONE_SIDED_PAGE_PRINT_TIME_MS + 1);

  await screen.findByText(printText);
  await waitFor(() => expect(mockPrinter.print).toHaveBeenCalledTimes(2));
  expect(mockPrinter.print).toHaveBeenLastCalledWith({ sides: 'one-sided' });
  await waitFor(() =>
    expect(mockKiosk.log).toHaveBeenLastCalledWith(
      expect.stringContaining(LogEventId.TestDeckPrinted)
    )
  );
  expect(mockKiosk.log).toHaveBeenLastCalledWith(
    expect.stringContaining('BMD paper ballot test deck printed')
  );
  jest.advanceTimersByTime(3 * ONE_SIDED_PAGE_PRINT_TIME_MS + 1);

  userEvent.click(
    await screen.findByText('Legal Paper Loaded, Continue Printing')
  );

  await screen.findByText(printText);
  await waitFor(() => expect(mockPrinter.print).toHaveBeenCalledTimes(3));
  expect(mockPrinter.print).toHaveBeenLastCalledWith({
    sides: 'two-sided-long-edge',
  });
  await waitFor(() =>
    expect(mockKiosk.log).toHaveBeenLastCalledWith(
      expect.stringContaining(LogEventId.TestDeckPrinted)
    )
  );
  expect(mockKiosk.log).toHaveBeenLastCalledWith(
    expect.stringContaining('Hand-marked paper ballot test deck printed')
  );
  jest.advanceTimersByTime(LAST_PRINT_JOB_SLEEP_MS + 1);

  await screen.findByText('District 5');
  expect(screen.queryByText('Printing')).not.toBeInTheDocument();
});

test('Printing L&A packages for all precincts, when HMPBs are not letter-size', async () => {
  const electionWithLegalSizeHmpbsDefinition = _.cloneDeep(
    electionWithMsEitherNeitherDefinition
  );
  electionWithLegalSizeHmpbsDefinition.election.ballotLayout!.paperSize =
    BallotPaperSize.Legal;

  renderInAppContext(<PrintTestDeckScreen />, {
    electionDefinition: electionWithLegalSizeHmpbsDefinition,
    logger: mockLogger,
    printBallotRef: mockPrintBallotRef,
    printer: mockPrinter,
  });

  userEvent.click(screen.getByText('All Precincts'));

  // Check that the printing modals appear in alphabetical order
  const precinctsInAlphabeticalOrder = [
    'Bywy',
    'Chester',
    'District 5',
    'East Weir',
    'Fentress',
    'French Camp',
    'Hebron',
    'Kenego',
    'Panhandle',
    'Reform',
    'Sherwood',
    'Southwest Ackerman',
    'West Weir',
  ];

  for (const [i, precinct] of precinctsInAlphabeticalOrder.entries()) {
    const printText = `Printing L&A Package (${i + 1} of 13): ${precinct}`;
    await screen.findByText(printText);
    await waitFor(() =>
      expect(mockPrinter.print).toHaveBeenCalledTimes(2 * i + 1)
    );
    expect(mockPrinter.print).toHaveBeenLastCalledWith({ sides: 'one-sided' });
    await waitFor(() =>
      expect(mockKiosk.log).toHaveBeenLastCalledWith(
        expect.stringContaining(LogEventId.TestDeckTallyReportPrinted)
      )
    );
    jest.advanceTimersByTime(ONE_SIDED_PAGE_PRINT_TIME_MS + 1);

    await screen.findByText(printText);
    await waitFor(() =>
      expect(mockPrinter.print).toHaveBeenCalledTimes(2 * i + 2)
    );
    expect(mockPrinter.print).toHaveBeenLastCalledWith({ sides: 'one-sided' });
    await waitFor(() =>
      expect(mockKiosk.log).toHaveBeenLastCalledWith(
        expect.stringContaining(LogEventId.TestDeckPrinted)
      )
    );
    expect(mockKiosk.log).toHaveBeenLastCalledWith(
      expect.stringContaining('BMD paper ballot test deck printed')
    );
    jest.advanceTimersByTime(3 * ONE_SIDED_PAGE_PRINT_TIME_MS + 1);
  }

  userEvent.click(
    await screen.findByText('Legal Paper Loaded, Continue Printing')
  );

  for (const [i, precinct] of precinctsInAlphabeticalOrder.entries()) {
    const printText = `Printing L&A Package (${i + 1} of 13): ${precinct}`;
    await screen.findByText(printText);
    await waitFor(() =>
      expect(mockPrinter.print).toHaveBeenCalledTimes(
        2 * precinctsInAlphabeticalOrder.length + i + 1
      )
    );
    expect(mockPrinter.print).toHaveBeenLastCalledWith({
      sides: 'two-sided-long-edge',
    });
    await waitFor(() =>
      expect(mockKiosk.log).toHaveBeenLastCalledWith(
        expect.stringContaining(LogEventId.TestDeckPrinted)
      )
    );
    expect(mockKiosk.log).toHaveBeenLastCalledWith(
      expect.stringContaining('Hand-marked paper ballot test deck printed')
    );
    if (i < precinctsInAlphabeticalOrder.length - 1) {
      jest.advanceTimersByTime(6 * TWO_SIDED_PAGE_PRINT_TIME_MS + 1);
    } else {
      jest.advanceTimersByTime(LAST_PRINT_JOB_SLEEP_MS + 1);
    }
  }

  await screen.findByText('All Precincts');
  expect(screen.queryByText('Printing')).not.toBeInTheDocument();
});
