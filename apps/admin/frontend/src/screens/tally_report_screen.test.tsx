import React from 'react';
import userEvent from '@testing-library/user-event';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import {
  advanceTimersAndPromises,
  fakeKiosk,
  fakePrinterInfo,
} from '@votingworks/test-utils';
import { fakeLogger, Logger } from '@votingworks/logging';
import { screen, waitFor, within } from '@testing-library/react';

import { Admin } from '@votingworks/api';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/api_mock';
import { TallyReportScreen } from './tally_report_screen';
import { routerPaths } from '../router_paths';

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

test('mark official results button disabled when no cast vote record files', async () => {
  apiMock.expectGetWriteInSummaryAdjudicated([]);
  apiMock.expectGetCastVoteRecordFileMode(Admin.CvrFileMode.Unlocked);
  renderInAppContext(<TallyReportScreen />, {
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
    logger,
    apiMock,
    route: routerPaths.tallyFullReport,
  });

  await waitFor(() => {
    apiMock.apiClient.assertComplete();
  });
  await advanceTimersAndPromises(); // wait for UI to settle
  expect(
    screen.getByRole('button', {
      name: 'Mark Tally Results as Official',
    })
  ).toBeDisabled();
});

test('when already official results', async () => {
  apiMock.expectGetWriteInSummaryAdjudicated([]);
  apiMock.expectGetCastVoteRecordFileMode(Admin.CvrFileMode.Official);
  renderInAppContext(<TallyReportScreen />, {
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
    isOfficialResults: true,
    logger,
    apiMock,
    route: routerPaths.tallyFullReport,
  });

  await waitFor(() => {
    apiMock.apiClient.assertComplete();
  });
  await advanceTimersAndPromises(); // wait for UI to settle
  expect(
    screen.getByRole('button', {
      name: 'Mark Tally Results as Official',
    })
  ).toBeDisabled();

  screen.getByText('Official Example Primary Election Tally Report');
});

test('marking results as official', async () => {
  apiMock.expectGetWriteInSummaryAdjudicated([]);
  apiMock.expectGetCastVoteRecordFileMode(Admin.CvrFileMode.Official);
  apiMock.expectMarkResultsOfficial();
  renderInAppContext(<TallyReportScreen />, {
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
    logger,
    apiMock,
    route: routerPaths.tallyFullReport,
  });

  screen.getByText('Unofficial Example Primary Election Tally Report');

  await waitFor(() => {
    expect(
      screen.getByRole('button', { name: 'Mark Tally Results as Official' })
    ).not.toBeDisabled();
  });
  userEvent.click(screen.getByText('Mark Tally Results as Official'));
  screen.getByText('Mark Unofficial Tally Results as Official Tally Results?');
  userEvent.click(
    within(screen.getByRole('alertdialog')).getByText(
      'Mark Tally Results as Official'
    )
  );
});

test('shows unofficial when unofficial', async () => {
  apiMock.expectGetWriteInSummaryAdjudicated([]);
  apiMock.expectGetCastVoteRecordFileMode(Admin.CvrFileMode.Official);
  apiMock.expectMarkResultsOfficial();
  renderInAppContext(<TallyReportScreen />, {
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
    logger,
    apiMock,
    route: routerPaths.tallyFullReport,
  });

  await waitFor(() => {
    expect(
      screen.getByRole('button', { name: 'Mark Tally Results as Official' })
    ).not.toBeDisabled();
  });
  userEvent.click(screen.getByText('Mark Tally Results as Official'));
  screen.getByText('Mark Unofficial Tally Results as Official Tally Results?');
  userEvent.click(
    within(screen.getByRole('alertdialog')).getByText(
      'Mark Tally Results as Official'
    )
  );
});

test('mark official results button not disabled when in test mode', async () => {
  apiMock.expectGetWriteInSummaryAdjudicated([]);
  apiMock.expectGetCastVoteRecordFileMode(Admin.CvrFileMode.Test);
  renderInAppContext(<TallyReportScreen />, {
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
    logger,
    apiMock,
    route: routerPaths.tallyFullReport,
  });

  await waitFor(() => {
    expect(
      screen.getByRole('button', { name: 'Mark Tally Results as Official' })
    ).not.toBeDisabled();
  });
});
