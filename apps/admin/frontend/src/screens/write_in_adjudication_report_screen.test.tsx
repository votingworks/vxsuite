import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import {
  expectPrint,
  fakeKiosk,
  fakePrinterInfo,
} from '@votingworks/test-utils';
import { fakeLogger, Logger } from '@votingworks/logging';

import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { TallyWriteInReportScreen } from './write_in_adjudication_report_screen';
import { screen, within } from '../../test/react_testing_library';
import { routerPaths } from '../router_paths';

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

test('renders provided data', async () => {
  const { electionDefinition } = electionGridLayoutNewHampshireAmherstFixtures;
  apiMock.expectGetElectionWriteInSummary({
    contestWriteInSummaries: {
      'Sheriff-4243fe0b': {
        contestId: 'Sheriff-4243fe0b',
        totalTally: 50,
        pendingTally: 10,
        invalidTally: 5,
        candidateTallies: {
          'Edward-Randolph-bf4c848a': {
            id: 'Edward-Randolph-bf4c848a',
            name: 'Edward Randolph',
            tally: 20,
          },
          rando: {
            id: 'rando',
            name: 'Random Write-In',
            tally: 15,
            isWriteIn: true,
          },
        },
      },
    },
  });
  const history = createMemoryHistory();
  renderInAppContext(<TallyWriteInReportScreen />, {
    electionDefinition,
    logger,
    apiMock,
    history,
  });

  screen.getByText('Report Preview');
  const report = await screen.findByTestId('write-in-tally-report');
  within(report).getByText(
    'Unofficial General Election Write-In Adjudication Report'
  );
  expect(
    within(report).getByText('Random Write-In').closest('tr')!
  ).toHaveTextContent('15');

  userEvent.click(screen.getByText('Print Report'));
  await expectPrint((printed) => {
    printed.getByText(
      'Unofficial General Election Write-In Adjudication Report'
    );
    expect(
      printed.getByText('Random Write-In').closest('tr')!
    ).toHaveTextContent('15');
  });

  screen.getByText('Save Report as PDF');

  userEvent.click(screen.getByText('Back to Reports'));
  expect(history.location.pathname).toEqual(routerPaths.reports);
});
