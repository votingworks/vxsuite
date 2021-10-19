import React from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { fakeKiosk } from '@votingworks/test-utils';

import PrintButton from './PrintButton';
import fakePrinter from '../../test/helpers/fakePrinter';
import renderInAppContext from '../../test/renderInAppContext';

beforeAll(() => {
  window.kiosk = fakeKiosk();
});

afterAll(() => {
  delete window.kiosk;
});

test('if only disconnected printers, show error modal', async () => {
  const mockKiosk = window.kiosk! as jest.Mocked<KioskBrowser.Kiosk>;
  mockKiosk.getPrinterInfo.mockResolvedValue([
    {
      description: 'banana',
      isDefault: true,
      name: 'banana',
      status: 1,
      connected: false,
    },
    {
      description: 'VxPrinter',
      isDefault: false,
      name: 'VxPrinter',
      status: 0,
      connected: false,
    },
  ]);

  const printer = fakePrinter();
  const afterPrint = jest.fn();
  const { getByText } = renderInAppContext(
    <PrintButton sides="two-sided-long-edge" afterPrint={afterPrint}>
      Print Now
    </PrintButton>,
    { printer }
  );

  await act(async () => {
    fireEvent.click(getByText('Print Now'));

    await waitFor(() =>
      getByText('The printer is not connected', { exact: false })
    );
  });

  expect(mockKiosk.getPrinterInfo).toBeCalled();

  expect(printer.print).not.toBeCalled();
  expect(afterPrint).not.toBeCalled();
});

test('if connected printers, show printing modal', async () => {
  const mockKiosk = window.kiosk! as jest.Mocked<KioskBrowser.Kiosk>;
  mockKiosk.getPrinterInfo.mockResolvedValue([
    {
      description: 'banana',
      isDefault: true,
      name: 'banana',
      status: 1,
      connected: false,
    },
    {
      description: 'VxPrinter',
      isDefault: false,
      name: 'VxPrinter',
      status: 0,
      connected: true,
    },
  ]);

  const printer = fakePrinter();
  const afterPrint = jest.fn();
  const { getByText } = renderInAppContext(
    <PrintButton afterPrint={afterPrint} sides="two-sided-long-edge">
      Print Now
    </PrintButton>,
    { printer }
  );

  await act(async () => {
    fireEvent.click(getByText('Print Now'));

    await waitFor(() => getByText('Printing', { exact: false }));
  });

  expect(mockKiosk.getPrinterInfo).toBeCalled();

  expect(printer.print).toBeCalled();
  expect(afterPrint).toBeCalled();
});
