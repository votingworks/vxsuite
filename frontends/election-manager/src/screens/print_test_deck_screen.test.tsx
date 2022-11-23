import React from 'react';
import userEvent from '@testing-library/user-event';
import { BallotPaperSize, Printer } from '@votingworks/types';
import {
  asElectionDefinition,
  electionWithMsEitherNeitherDefinition,
} from '@votingworks/fixtures';
import {
  expectPrint,
  fakeKiosk,
  fakePrinter,
  fakePrinterInfo,
} from '@votingworks/test-utils';
import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { screen, waitFor } from '@testing-library/react';

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
let mockPrinter: jest.Mocked<Printer>;

beforeEach(() => {
  jest.useFakeTimers();
  mockKiosk = fakeKiosk();
  mockKiosk.getPrinterInfo.mockResolvedValue([
    fakePrinterInfo({ connected: true, name: 'VxPrinter' }),
  ]);
  window.kiosk = mockKiosk;
  mockLogger = new Logger(LogSource.VxAdminFrontend, mockKiosk);
  mockPrinter = fakePrinter();
});

afterAll(() => {
  delete window.kiosk;
});

test('Printing L&A package for one precinct', async () => {
  renderInAppContext(<PrintTestDeckScreen />, {
    logger: mockLogger,
  });

  userEvent.click(screen.getByText('District 5'));

  await screen.findByText('Printing L&A Package for District 5');
  await expectPrint((printedElement, printOptions) => {
    printedElement.getByText('Test Deck Precinct Tally Report for: District 5');
    expect(printOptions).toMatchObject({ sides: 'one-sided' });
  });
  await waitFor(() =>
    expect(mockKiosk.log).toHaveBeenLastCalledWith(
      expect.stringContaining(LogEventId.TestDeckTallyReportPrinted)
    )
  );
  jest.advanceTimersByTime(ONE_SIDED_PAGE_PRINT_TIME_MS);

  await screen.findByText('Printing L&A Package for District 5');
  await expectPrint((printedElement, printOptions) => {
    expect(printedElement.getAllByText('Unofficial TEST Ballot')).toHaveLength(
      4
    );
    expect(printedElement.getAllByText('District 5')).toHaveLength(4);
    expect(printOptions).toMatchObject({ sides: 'one-sided' });
  });
  await waitFor(() =>
    expect(mockKiosk.log).toHaveBeenLastCalledWith(
      expect.stringContaining(LogEventId.TestDeckPrinted)
    )
  );
  expect(mockKiosk.log).toHaveBeenLastCalledWith(
    expect.stringContaining('BMD paper ballot test deck printed')
  );
  jest.advanceTimersByTime(4 * ONE_SIDED_PAGE_PRINT_TIME_MS);

  await screen.findByText('Printing L&A Package for District 5');
  await expectPrint((printedElement, printOptions) => {
    expect(printedElement.getAllByText('Mocked HMPB')).toHaveLength(7);
    expect(printedElement.getAllByText(`Precinct: District 5`)).toHaveLength(7);
    expect(printOptions).toMatchObject({ sides: 'two-sided-long-edge' });
  });
  await waitFor(() =>
    expect(mockKiosk.log).toHaveBeenLastCalledWith(
      expect.stringContaining(LogEventId.TestDeckPrinted)
    )
  );
  expect(mockKiosk.log).toHaveBeenLastCalledWith(
    expect.stringContaining('Hand-marked paper ballot test deck printed')
  );
  jest.advanceTimersByTime(LAST_PRINT_JOB_SLEEP_MS);

  await screen.findByText('District 5');
  expect(screen.queryByText('Printing')).not.toBeInTheDocument();
});

test('Printing L&A packages for all precincts', async () => {
  renderInAppContext(<PrintTestDeckScreen />, {
    logger: mockLogger,
    printer: mockPrinter,
  });

  userEvent.click(screen.getByText('Print Packages for All Precincts'));

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
    await screen.findByText(`Printing L&A Package for ${precinct}`);
    await screen.findByText(`This is package ${i + 1} of 13.`);
    await expectPrint((printedElement, printOptions) => {
      printedElement.getByText(
        `Test Deck Precinct Tally Report for: ${precinct}`
      );
      expect(printOptions).toMatchObject({ sides: 'one-sided' });
    });
    await waitFor(() =>
      expect(mockKiosk.log).toHaveBeenLastCalledWith(
        expect.stringContaining(LogEventId.TestDeckTallyReportPrinted)
      )
    );
    jest.advanceTimersByTime(ONE_SIDED_PAGE_PRINT_TIME_MS);

    await screen.findByText(`Printing L&A Package for ${precinct}`);
    await screen.findByText(`This is package ${i + 1} of 13.`);
    await expectPrint((printedElement, printOptions) => {
      expect(
        printedElement.getAllByText('Unofficial TEST Ballot')
      ).toHaveLength(4);
      expect(printedElement.getAllByText(precinct)).toHaveLength(4);
      expect(printOptions).toMatchObject({ sides: 'one-sided' });
    });
    await waitFor(() =>
      expect(mockKiosk.log).toHaveBeenLastCalledWith(
        expect.stringContaining(LogEventId.TestDeckPrinted)
      )
    );
    expect(mockKiosk.log).toHaveBeenLastCalledWith(
      expect.stringContaining('BMD paper ballot test deck printed')
    );
    jest.advanceTimersByTime(4 * ONE_SIDED_PAGE_PRINT_TIME_MS);

    await screen.findByText(`Printing L&A Package for ${precinct}`);
    await screen.findByText(`This is package ${i + 1} of 13.`);
    await expectPrint((printedElement, printOptions) => {
      expect(printedElement.getAllByText('Mocked HMPB')).toHaveLength(7);
      expect(printedElement.getAllByText(`Precinct: ${precinct}`)).toHaveLength(
        7
      );
      expect(printOptions).toMatchObject({ sides: 'two-sided-long-edge' });
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
      jest.advanceTimersByTime(7 * TWO_SIDED_PAGE_PRINT_TIME_MS);
    } else {
      jest.advanceTimersByTime(LAST_PRINT_JOB_SLEEP_MS);
    }
  }

  await screen.findByText('Print Packages for All Precincts');
  expect(screen.queryByText('Printing')).not.toBeInTheDocument();
});

test('Printing L&A package for one precinct, when HMPBs are not letter-size', async () => {
  const electionWithLegalSizeHmpbsDefinition = asElectionDefinition({
    ...electionWithMsEitherNeitherDefinition.election,
    ballotLayout: {
      paperSize: BallotPaperSize.Legal,
    },
  });

  renderInAppContext(<PrintTestDeckScreen />, {
    electionDefinition: electionWithLegalSizeHmpbsDefinition,
    logger: mockLogger,
    printer: mockPrinter,
  });

  userEvent.click(screen.getByText('District 5'));

  await screen.findByText('Printing L&A Package for District 5');
  await screen.findByText('Currently printing letter-size pages.');
  await expectPrint((printedElement, printOptions) => {
    printedElement.getByText('Test Deck Precinct Tally Report for: District 5');
    expect(printOptions).toMatchObject({ sides: 'one-sided' });
  });
  await waitFor(() =>
    expect(mockKiosk.log).toHaveBeenLastCalledWith(
      expect.stringContaining(LogEventId.TestDeckTallyReportPrinted)
    )
  );
  jest.advanceTimersByTime(ONE_SIDED_PAGE_PRINT_TIME_MS);

  await screen.findByText('Printing L&A Package for District 5');
  await screen.findByText('Currently printing letter-size pages.');
  await expectPrint((printedElement, printOptions) => {
    expect(printedElement.getAllByText('Unofficial TEST Ballot')).toHaveLength(
      4
    );
    expect(printedElement.getAllByText('District 5')).toHaveLength(4);
    expect(printOptions).toMatchObject({ sides: 'one-sided' });
  });
  await waitFor(() =>
    expect(mockKiosk.log).toHaveBeenLastCalledWith(
      expect.stringContaining(LogEventId.TestDeckPrinted)
    )
  );
  expect(mockKiosk.log).toHaveBeenLastCalledWith(
    expect.stringContaining('BMD paper ballot test deck printed')
  );
  jest.advanceTimersByTime(4 * ONE_SIDED_PAGE_PRINT_TIME_MS);

  userEvent.click(
    await screen.findByText('Legal Paper Loaded, Continue Printing')
  );

  await screen.findByText('Printing L&A Package for District 5');
  await screen.findByText('Currently printing legal-size pages.');
  await expectPrint((printedElement, printOptions) => {
    expect(printedElement.getAllByText('Mocked HMPB')).toHaveLength(7);
    expect(printedElement.getAllByText('Precinct: District 5')).toHaveLength(7);
    expect(printOptions).toMatchObject({ sides: 'two-sided-long-edge' });
  });
  await waitFor(() =>
    expect(mockKiosk.log).toHaveBeenLastCalledWith(
      expect.stringContaining(LogEventId.TestDeckPrinted)
    )
  );
  expect(mockKiosk.log).toHaveBeenLastCalledWith(
    expect.stringContaining('Hand-marked paper ballot test deck printed')
  );
  jest.advanceTimersByTime(LAST_PRINT_JOB_SLEEP_MS);

  await screen.findByText('District 5');
  expect(screen.queryByText('Printing')).not.toBeInTheDocument();
});

test('Printing L&A packages for all precincts, when HMPBs are not letter-size', async () => {
  const electionWithLegalSizeHmpbsDefinition = asElectionDefinition({
    ...electionWithMsEitherNeitherDefinition.election,
    ballotLayout: {
      paperSize: BallotPaperSize.Legal,
    },
  });

  renderInAppContext(<PrintTestDeckScreen />, {
    electionDefinition: electionWithLegalSizeHmpbsDefinition,
    logger: mockLogger,
    printer: mockPrinter,
  });

  userEvent.click(screen.getByText('Print Packages for All Precincts'));

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
    await screen.findByText(`Printing L&A Package for ${precinct}`);
    await screen.findByText(`This is package ${i + 1} of 13.`);
    await screen.findByText('Currently printing letter-size pages.');
    await expectPrint((printedElement, printOptions) => {
      printedElement.getByText(
        `Test Deck Precinct Tally Report for: ${precinct}`
      );
      expect(printOptions).toMatchObject({ sides: 'one-sided' });
    });
    await waitFor(() =>
      expect(mockKiosk.log).toHaveBeenLastCalledWith(
        expect.stringContaining(LogEventId.TestDeckTallyReportPrinted)
      )
    );
    jest.advanceTimersByTime(ONE_SIDED_PAGE_PRINT_TIME_MS);

    await screen.findByText(`Printing L&A Package for ${precinct}`);
    await screen.findByText(`This is package ${i + 1} of 13.`);
    await screen.findByText('Currently printing letter-size pages.');
    await expectPrint((printedElement, printOptions) => {
      expect(
        printedElement.getAllByText('Unofficial TEST Ballot')
      ).toHaveLength(4);
      expect(printedElement.getAllByText(precinct)).toHaveLength(4);
      expect(printOptions).toMatchObject({ sides: 'one-sided' });
    });
    await waitFor(() =>
      expect(mockKiosk.log).toHaveBeenLastCalledWith(
        expect.stringContaining(LogEventId.TestDeckPrinted)
      )
    );
    expect(mockKiosk.log).toHaveBeenLastCalledWith(
      expect.stringContaining('BMD paper ballot test deck printed')
    );
    jest.advanceTimersByTime(4 * ONE_SIDED_PAGE_PRINT_TIME_MS);
  }

  userEvent.click(
    await screen.findByText('Legal Paper Loaded, Continue Printing')
  );

  for (const [i, precinct] of precinctsInAlphabeticalOrder.entries()) {
    await screen.findByText(`Printing L&A Package for ${precinct}`);
    await screen.findByText(`This is package ${i + 1} of 13.`);
    await screen.findByText('Currently printing legal-size pages.');
    await expectPrint((printedElement, printOptions) => {
      expect(printedElement.getAllByText('Mocked HMPB')).toHaveLength(7);
      expect(printedElement.getAllByText(`Precinct: ${precinct}`)).toHaveLength(
        7
      );
      expect(printOptions).toMatchObject({ sides: 'two-sided-long-edge' });
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
      jest.advanceTimersByTime(7 * TWO_SIDED_PAGE_PRINT_TIME_MS);
    } else {
      jest.advanceTimersByTime(LAST_PRINT_JOB_SLEEP_MS);
    }
  }

  await screen.findByText('Print Packages for All Precincts');
  expect(screen.queryByText('Printing')).not.toBeInTheDocument();
});
