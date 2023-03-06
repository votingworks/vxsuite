import React from 'react';
import {
  electionGridLayoutNewHampshireHudsonFixtures,
  electionMinimalExhaustiveSampleDefinition,
} from '@votingworks/fixtures';
import { fakeKiosk, fakePrinterInfo } from '@votingworks/test-utils';
import { fakeLogger, Logger } from '@votingworks/logging';
import { screen } from '@testing-library/react';

import { Admin } from '@votingworks/api';
import { renderInAppContext } from '../../test/render_in_app_context';
import {
  ApiMock,
  createApiMock,
  createMockApiClient,
  MockApiClient,
} from '../../test/helpers/api_mock';
import { LogicAndAccuracyScreen } from './logic_and_accuracy_screen';

jest.mock('../components/hand_marked_paper_ballot');

let mockKiosk: jest.Mocked<KioskBrowser.Kiosk>;
let logger: Logger;
let apiClient: MockApiClient;
let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  mockKiosk = fakeKiosk();
  mockKiosk.getPrinterInfo.mockResolvedValue([
    fakePrinterInfo({ connected: true, name: 'VxPrinter' }),
  ]);
  window.kiosk = mockKiosk;
  logger = fakeLogger();
  apiClient = createMockApiClient();
  apiMock = createApiMock(apiClient);
});

afterAll(() => {
  delete window.kiosk;
  apiClient.assertComplete();
});

test('l&a documents accessible in unlocked mode', async () => {
  apiMock.expectGetCastVoteRecordFileMode(Admin.CvrFileMode.Unlocked);

  renderInAppContext(<LogicAndAccuracyScreen />, {
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
    logger,
    apiClient,
  });
  await screen.findByText('List Precinct L&A Packages');
  await screen.findByText('Print Full Test Deck Tally Report');
});

test('l&a documents accessible in test mode', async () => {
  apiMock.expectGetCastVoteRecordFileMode(Admin.CvrFileMode.Unlocked);

  renderInAppContext(<LogicAndAccuracyScreen />, {
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
    logger,
    apiClient,
  });
  await screen.findByText('List Precinct L&A Packages');
  await screen.findByText('Print Full Test Deck Tally Report');
});

test('l&a documents not accessible in official mode', async () => {
  apiMock.expectGetCastVoteRecordFileMode(Admin.CvrFileMode.Official);

  renderInAppContext(<LogicAndAccuracyScreen />, {
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
    logger,
    apiClient,
  });
  await screen.findByText(
    'L&A testing documents are not available after official election CVRs have been loaded.'
  );
  expect(
    screen.queryByText('List Precinct L&A Packages')
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText('Print Full Test Deck Tally Report')
  ).not.toBeInTheDocument();
});

test('l&a documents not accessible in gridLayouts election', async () => {
  apiMock.expectGetCastVoteRecordFileMode(Admin.CvrFileMode.Unlocked);

  renderInAppContext(<LogicAndAccuracyScreen />, {
    electionDefinition:
      electionGridLayoutNewHampshireHudsonFixtures.electionDefinition,
    logger,
    apiClient,
  });
  await screen.findByText(
    'VxAdmin does not produce ballots or L&A documents for this election.'
  );
});
