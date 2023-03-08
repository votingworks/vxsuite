import React from 'react';
import userEvent from '@testing-library/user-event';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import {
  expectPrint,
  fakeKiosk,
  fakePrinterInfo,
} from '@votingworks/test-utils';
import { fakeLogger, LogEventId, Logger } from '@votingworks/logging';
import { screen, waitFor, within } from '@testing-library/react';

import { Admin } from '@votingworks/api';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/api_mock';
import { PrintedBallotsReportScreen } from './printed_ballots_report_screen';
import { mockPrintedBallotRecord } from '../../test/api_mock_data';

jest.mock('../components/hand_marked_paper_ballot');

let mockKiosk: jest.Mocked<KioskBrowser.Kiosk>;
let logger: Logger;
let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  mockKiosk = fakeKiosk();
  mockKiosk.getPrinterInfo.mockResolvedValue([
    fakePrinterInfo({ connected: true, name: 'VxPrinter' }),
  ]);
  window.kiosk = mockKiosk;
  logger = fakeLogger();
  apiMock = createApiMock();
});

afterAll(() => {
  delete window.kiosk;
  apiMock.assertComplete();
});

test('renders information, prints, and logs success', async () => {
  const configuredAt = new Date().toISOString();
  const mockPrintedBallotRecords = [
    mockPrintedBallotRecord,
    mockPrintedBallotRecord,
    {
      ...mockPrintedBallotRecord,
      ballotType: Admin.PrintableBallotType.Precinct,
    },
  ];
  apiMock.expectGetOfficialPrintedBallots(mockPrintedBallotRecords);

  renderInAppContext(<PrintedBallotsReportScreen />, {
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
    configuredAt,
    logger,
    apiMock,
  });

  await screen.findByText(/2 absentee ballots/);
  await screen.findByText(/1 precinct ballot/);
  const tableRow = screen.getByTestId('row-precinct-1-1M'); // Row in the printed ballot report for the Bywy ballots printed earlier
  expect(
    within(tableRow)
      .getAllByRole('cell', { hidden: true })!
      .map((column) => column.textContent)
  ).toStrictEqual(['Precinct 1', '1M', '2', '1', '3']);
  userEvent.click(screen.getByText('Print Report'));

  await waitFor(() => screen.getByText('Printing'));
  await expectPrint((printedElement, printOptions) => {
    printedElement.getByText('Printed Ballots Report');
    expect(printOptions).toMatchObject({ sides: 'one-sided' });
  });
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.PrintedBallotReportPrinted,
    expect.any(String),
    expect.anything()
  );
});
