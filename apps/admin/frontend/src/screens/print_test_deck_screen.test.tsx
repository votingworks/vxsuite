import {
  electionMinimalExhaustiveSampleDefinition,
  asElectionDefinition,
  electionWithMsEitherNeitherDefinition,
} from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { BallotPaperSize, Printer } from '@votingworks/types';
import {
  advanceTimers,
  expectPrint,
  fakeFileWriter,
  fakeKiosk,
  fakePrinter,
  fakePrinterInfo,
  fakeUsbDrive,
} from '@votingworks/test-utils';
import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { mockUsbDrive } from '@votingworks/ui';
import { screen, waitFor } from '../../test/react_testing_library';

import {
  LAST_PRINT_JOB_SLEEP_MS,
  ONE_SIDED_PAGE_PRINT_TIME_MS,
  PrintTestDeckScreen,
  TWO_SIDED_PAGE_PRINT_TIME_MS,
} from './print_test_deck_screen';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/api_mock';

jest.mock('../components/hand_marked_paper_ballot');

let mockKiosk: jest.Mocked<KioskBrowser.Kiosk>;
let mockLogger: Logger;
let mockPrinter: jest.Mocked<Printer>;

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  mockKiosk = fakeKiosk();
  mockKiosk.getPrinterInfo.mockResolvedValue([
    fakePrinterInfo({ connected: true, name: 'VxPrinter' }),
  ]);
  window.kiosk = mockKiosk;
  mockLogger = new Logger(LogSource.VxAdminFrontend, mockKiosk);
  mockPrinter = fakePrinter();
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
  const fileWriter = fakeFileWriter();
  mockKiosk.saveAs = jest.fn().mockResolvedValue(fileWriter);
  mockKiosk.writeFile = jest.fn().mockResolvedValue(fileWriter);

  apiMock = createApiMock();
});

afterAll(() => {
  delete window.kiosk;
  apiMock.assertComplete();
});

test('Saving L&A package for one precinct', () => {
  const usbDrive = mockUsbDrive('mounted');
  renderInAppContext(<PrintTestDeckScreen />, {
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
    logger: mockLogger,
    usbDrive,
    apiMock,
  });

  userEvent.click(screen.getByText('Save Precinct 1 to PDF'));
  screen.getByText('Save Logic & Accuracy Package');
  screen.getByText('Save');
});

test('Saving L&A package for all precincts', () => {
  const usbDrive = mockUsbDrive('mounted');
  renderInAppContext(<PrintTestDeckScreen />, {
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
    logger: mockLogger,
    usbDrive,
    apiMock,
  });

  userEvent.click(screen.getByText('Save Packages for All Precincts as PDF'));
  screen.getByText('Save Logic & Accuracy Package');
  screen.getByText('Save');
});

test('Printing L&A package for one precinct', async () => {
  renderInAppContext(<PrintTestDeckScreen />, {
    logger: mockLogger,
    apiMock,
  });

  userEvent.click(screen.getByText('Print District 5'));

  await screen.findByText('Printing L&A Package for District 5');
  await expectPrint((printedElement, printOptions) => {
    printedElement.getByText('Test Deck Precinct Tally Report for District 5');
    expect(printOptions).toMatchObject({ sides: 'one-sided' });
  });
  await waitFor(() =>
    expect(mockKiosk.log).toHaveBeenLastCalledWith(
      expect.stringContaining(LogEventId.TestDeckTallyReportPrinted)
    )
  );
  advanceTimers(ONE_SIDED_PAGE_PRINT_TIME_MS / 1000);

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
  advanceTimers((4 * ONE_SIDED_PAGE_PRINT_TIME_MS) / 1000);

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
  advanceTimers(LAST_PRINT_JOB_SLEEP_MS / 1000);

  await screen.findByText('Print District 5');
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

test('Printing L&A packages for all precincts', async () => {
  renderInAppContext(<PrintTestDeckScreen />, {
    logger: mockLogger,
    printer: mockPrinter,
    apiMock,
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
        `Test Deck Precinct Tally Report for ${precinct}`
      );
      expect(printOptions).toMatchObject({ sides: 'one-sided' });
    });
    await waitFor(() =>
      expect(mockKiosk.log).toHaveBeenLastCalledWith(
        expect.stringContaining(LogEventId.TestDeckTallyReportPrinted)
      )
    );
    advanceTimers(ONE_SIDED_PAGE_PRINT_TIME_MS / 1000);

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
    advanceTimers((4 * ONE_SIDED_PAGE_PRINT_TIME_MS) / 1000);

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
      advanceTimers((7 * TWO_SIDED_PAGE_PRINT_TIME_MS) / 1000);
    } else {
      advanceTimers(LAST_PRINT_JOB_SLEEP_MS / 1000);
    }
  }

  await screen.findByText('Print Packages for All Precincts');
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
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
    apiMock,
  });

  userEvent.click(screen.getByText('Print District 5'));

  await screen.findByText('Printing L&A Package for District 5');
  await screen.findByText('Currently printing letter-size pages.');
  await expectPrint((printedElement, printOptions) => {
    printedElement.getByText('Test Deck Precinct Tally Report for District 5');
    expect(printOptions).toMatchObject({ sides: 'one-sided' });
  });
  await waitFor(() =>
    expect(mockKiosk.log).toHaveBeenLastCalledWith(
      expect.stringContaining(LogEventId.TestDeckTallyReportPrinted)
    )
  );
  advanceTimers(ONE_SIDED_PAGE_PRINT_TIME_MS / 1000);

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
  advanceTimers((4 * ONE_SIDED_PAGE_PRINT_TIME_MS) / 1000);

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
  advanceTimers(LAST_PRINT_JOB_SLEEP_MS / 1000);

  await screen.findByText('Print District 5');
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
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
    apiMock,
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
        `Test Deck Precinct Tally Report for ${precinct}`
      );
      expect(printOptions).toMatchObject({ sides: 'one-sided' });
    });
    await waitFor(() =>
      expect(mockKiosk.log).toHaveBeenLastCalledWith(
        expect.stringContaining(LogEventId.TestDeckTallyReportPrinted)
      )
    );
    advanceTimers(ONE_SIDED_PAGE_PRINT_TIME_MS / 1000);

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
    advanceTimers((4 * ONE_SIDED_PAGE_PRINT_TIME_MS) / 1000);
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
      advanceTimers((7 * TWO_SIDED_PAGE_PRINT_TIME_MS) / 1000);
    } else {
      advanceTimers(LAST_PRINT_JOB_SLEEP_MS / 1000);
    }
  }

  await screen.findByText('Print Packages for All Precincts');
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
