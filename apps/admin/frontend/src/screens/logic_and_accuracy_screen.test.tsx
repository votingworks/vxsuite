import React from 'react';
import { screen } from '@testing-library/react';
import { electionGridLayoutNewHampshireHudsonFixtures } from '@votingworks/fixtures';
import { Logger, fakeLogger } from '@votingworks/logging';
import { fakeKiosk, fakePrinterInfo } from '@votingworks/test-utils';

import { ApiMock, createApiMock } from '../../test/helpers/api_mock';
import { renderInAppContext } from '../../test/render_in_app_context';
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

test('l&a documents not accessible', async () => {
  renderInAppContext(<LogicAndAccuracyScreen />, {
    electionDefinition:
      electionGridLayoutNewHampshireHudsonFixtures.electionDefinition,
    logger,
    apiMock,
  });
  await screen.findByText(
    'VxAdmin does not produce ballots or L&A documents for this election.'
  );
});
