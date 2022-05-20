import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react';
import { fakeKiosk, fakePrinterInfo } from '@votingworks/test-utils';

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

  const { getByText, getByLabelText } = renderInAppContext(
    <PrintTestDeckScreen />
  );

  fireEvent.click(getByText('All Precincts'));

  // Check that the printing modals appear in alphabetical order
  await waitFor(() => getByLabelText('Printing L&A Package (1 of 13): Bywy.'));
  jest.advanceTimersByTime(3000);
  await waitFor(() => getByLabelText('Printing L&A Package (1 of 13): Bywy.'));
  jest.advanceTimersByTime(30000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (2 of 13): Chester.')
  );
  jest.advanceTimersByTime(3000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (2 of 13): Chester.')
  );
  jest.advanceTimersByTime(30000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (3 of 13): District 5.')
  );
  jest.advanceTimersByTime(3000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (3 of 13): District 5.')
  );
  jest.advanceTimersByTime(30000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (4 of 13): East Weir.')
  );
  jest.advanceTimersByTime(3000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (4 of 13): East Weir.')
  );
  jest.advanceTimersByTime(30000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (5 of 13): Fentress.')
  );
  jest.advanceTimersByTime(3000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (5 of 13): Fentress.')
  );
  jest.advanceTimersByTime(30000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (6 of 13): French Camp.')
  );
  jest.advanceTimersByTime(3000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (6 of 13): French Camp.')
  );
  jest.advanceTimersByTime(30000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (7 of 13): Hebron.')
  );
  jest.advanceTimersByTime(3000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (7 of 13): Hebron.')
  );
  jest.advanceTimersByTime(30000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (8 of 13): Kenego.')
  );
  jest.advanceTimersByTime(3000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (8 of 13): Kenego.')
  );
  jest.advanceTimersByTime(30000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (9 of 13): Panhandle.')
  );
  jest.advanceTimersByTime(3000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (9 of 13): Panhandle.')
  );
  jest.advanceTimersByTime(30000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (10 of 13): Reform.')
  );
  jest.advanceTimersByTime(3000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (10 of 13): Reform.')
  );
  jest.advanceTimersByTime(30000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (11 of 13): Sherwood.')
  );
  jest.advanceTimersByTime(3000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (11 of 13): Sherwood.')
  );
  jest.advanceTimersByTime(30000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (12 of 13): Southwest Ackerman.')
  );
  jest.advanceTimersByTime(3000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (12 of 13): Southwest Ackerman.')
  );
  jest.advanceTimersByTime(30000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (13 of 13): West Weir.')
  );
  jest.advanceTimersByTime(3000);
  await waitFor(() =>
    getByLabelText('Printing L&A Package (13 of 13): West Weir.')
  );
});
