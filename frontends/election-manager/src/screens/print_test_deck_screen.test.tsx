import React from 'react';
import userEvent from '@testing-library/user-event';
import { fakeKiosk, fakePrinterInfo } from '@votingworks/test-utils';
import { screen } from '@testing-library/react';

import { PrintTestDeckScreen } from './print_test_deck_screen';
import { renderInAppContext } from '../../test/render_in_app_context';

jest.mock('../components/hand_marked_paper_ballot');

beforeAll(() => {
  window.kiosk = fakeKiosk();
});

afterAll(() => {
  delete window.kiosk;
});

test('Printing all L&A packages sorts precincts', async () => {
  jest.useFakeTimers();
  const mockKiosk = window.kiosk! as jest.Mocked<KioskBrowser.Kiosk>;
  mockKiosk.getPrinterInfo.mockResolvedValue([
    fakePrinterInfo({ name: 'VxPrinter', connected: true }),
  ]);

  renderInAppContext(<PrintTestDeckScreen />);

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
  for (let i = 0; i < precinctsInAlphabeticalOrder.length; i += 1) {
    const precinct = precinctsInAlphabeticalOrder[i];
    const printText = `Printing L&A Package (${i + 1} of 13): ${precinct}.`;
    await screen.findByLabelText(printText);
    jest.advanceTimersByTime(5000);
    await screen.findByLabelText(printText);
    jest.advanceTimersByTime(30000);
    await screen.findByLabelText(printText);
    jest.advanceTimersByTime(30000);
  }
  await screen.findByText('All Precincts');
  expect(screen.queryByText('Printing')).not.toBeInTheDocument();
});
