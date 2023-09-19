import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { fakeKiosk, fakePrinterInfo } from '@votingworks/test-utils';
import { fakeLogger, Logger } from '@votingworks/logging';
import { screen } from '@testing-library/react';

import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { LogicAndAccuracyScreen } from './logic_and_accuracy_screen';

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

test('l&a documents accessible in unlocked mode', async () => {
  apiMock.expectGetCastVoteRecordFileMode('unlocked');

  renderInAppContext(<LogicAndAccuracyScreen />, {
    electionDefinition: electionTwoPartyPrimaryDefinition,
    logger,
    apiMock,
  });
  await screen.findByText('List Precinct L&A Packages');
  await screen.findByText('Print Full Test Deck Tally Report');
});

test('l&a documents accessible in test mode', async () => {
  apiMock.expectGetCastVoteRecordFileMode('unlocked');

  renderInAppContext(<LogicAndAccuracyScreen />, {
    electionDefinition: electionTwoPartyPrimaryDefinition,
    logger,
    apiMock,
  });
  await screen.findByText('List Precinct L&A Packages');
  await screen.findByText('Print Full Test Deck Tally Report');
});

test('l&a documents not accessible in official mode', async () => {
  apiMock.expectGetCastVoteRecordFileMode('official');

  renderInAppContext(<LogicAndAccuracyScreen />, {
    electionDefinition: electionTwoPartyPrimaryDefinition,
    logger,
    apiMock,
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
