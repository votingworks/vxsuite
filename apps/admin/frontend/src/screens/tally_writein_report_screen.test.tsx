import React from 'react';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { fakeKiosk, fakePrinterInfo } from '@votingworks/test-utils';
import { fakeLogger, Logger } from '@votingworks/logging';
import { screen } from '@testing-library/react';

import type { WriteInAdjudicatedTally } from '@votingworks/admin-backend';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/api_mock';
import { TallyWriteInReportScreen } from './tally_writein_report_screen';

let mockKiosk: jest.Mocked<KioskBrowser.Kiosk>;
let logger: Logger;
let apiMock: ApiMock;

const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;

const nonOfficialAdjudicationSummaryMammal: WriteInAdjudicatedTally = {
  status: 'adjudicated',
  adjudicationType: 'write-in-candidate',
  contestId: 'zoo-council-mammal',
  tally: 1,
  candidateName: 'Chimera',
  candidateId: 'uuid',
};

const nonOfficialAdjudicationSummaryFish: WriteInAdjudicatedTally = {
  status: 'adjudicated',
  adjudicationType: 'write-in-candidate',
  contestId: 'aquarium-council-fish',
  tally: 1,
  candidateName: 'Loch Ness',
  candidateId: 'uuid',
};

const officialAdjudicationSummaryFish: WriteInAdjudicatedTally = {
  status: 'adjudicated',
  adjudicationType: 'official-candidate',
  contestId: 'aquarium-council-fish',
  tally: 1,
  candidateName: 'Loch Ness',
  candidateId: 'Loch Ness',
};

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

test('when no adjudications', () => {
  apiMock.expectGetWriteInTalliesAdjudicated([]);
  renderInAppContext(<TallyWriteInReportScreen />, {
    electionDefinition,
    logger,
    apiMock,
  });

  screen.getByText(
    /there are no write-in votes adjudicated to non-official candidates/
  );
  expect(screen.queryByText('Report Preview')).not.toBeInTheDocument();
  expect(screen.queryByText('Print Report')).not.toBeInTheDocument();
});

test('with contest from one party adjudicated', async () => {
  apiMock.expectGetWriteInTalliesAdjudicated([
    nonOfficialAdjudicationSummaryMammal,
  ]);
  renderInAppContext(<TallyWriteInReportScreen />, {
    electionDefinition,
    logger,
    apiMock,
  });

  // should show a report, but only for the party with the adjudicated contest
  await screen.findByText('Report Preview');

  screen.getByText('Print Report');
  screen.getByText(
    'Unofficial Mammal Party Example Primary Election Write-In Tally Report'
  );
  screen.getByTestId('results-table-zoo-council-mammal');
  expect(
    screen.queryByText(
      'Unofficial Fish Party Example Primary Election Write-In Tally Report'
    )
  ).not.toBeInTheDocument();
  expect(
    screen.queryByTestId('results-table-aquarium-council-fish')
  ).not.toBeInTheDocument();
});

test('with contest from multiple parties adjudicated', async () => {
  apiMock.expectGetWriteInTalliesAdjudicated([
    nonOfficialAdjudicationSummaryMammal,
    nonOfficialAdjudicationSummaryFish,
  ]);
  renderInAppContext(<TallyWriteInReportScreen />, {
    electionDefinition,
    logger,
    apiMock,
  });

  // should show a reports for both parties
  await screen.findByText('Report Preview');

  screen.getByText('Print Report');
  screen.getByText(
    'Unofficial Mammal Party Example Primary Election Write-In Tally Report'
  );
  screen.getByTestId('results-table-zoo-council-mammal');
  screen.getByText(
    'Unofficial Fish Party Example Primary Election Write-In Tally Report'
  );
  screen.getByTestId('results-table-aquarium-council-fish');
});

test('ignores adjudications for official candidates', async () => {
  apiMock.expectGetWriteInTalliesAdjudicated([
    nonOfficialAdjudicationSummaryMammal,
    officialAdjudicationSummaryFish,
  ]);
  renderInAppContext(<TallyWriteInReportScreen />, {
    electionDefinition,
    logger,
    apiMock,
  });

  // should show a report, but only for the party with contest adjudicated for non-official candidates
  await screen.findByText('Report Preview');

  screen.getByText('Print Report');
  screen.getByText(
    'Unofficial Mammal Party Example Primary Election Write-In Tally Report'
  );
  screen.getByTestId('results-table-zoo-council-mammal');
  expect(
    screen.queryByText(
      'Unofficial Fish Party Example Primary Election Write-In Tally Report'
    )
  ).not.toBeInTheDocument();
  expect(
    screen.queryByTestId('results-table-aquarium-council-fish')
  ).not.toBeInTheDocument();
});
