import React from 'react';
import {
  act,
  fireEvent,
  waitFor,
  getByText as domGetByText,
  waitForElementToBeRemoved,
} from '@testing-library/react';
import {
  fakeKiosk,
  fakePrinter,
  fakePrinterInfo,
} from '@votingworks/test-utils';
import { deferred } from '@votingworks/utils';

import { DeprecatedPrintButton } from './deprecated_print_button';
import { renderInAppContext } from '../../test/render_in_app_context';

beforeAll(() => {
  window.kiosk = fakeKiosk();
});

afterAll(() => {
  delete window.kiosk;
});

test('if only disconnected printers, show error modal', async () => {
  const mockKiosk = window.kiosk! as jest.Mocked<KioskBrowser.Kiosk>;
  mockKiosk.getPrinterInfo.mockResolvedValue([
    fakePrinterInfo({ connected: false }),
    fakePrinterInfo({ name: 'VxPrinter', connected: false }),
  ]);

  const printer = fakePrinter();
  const afterPrint = jest.fn();
  const { getByText } = renderInAppContext(
    <DeprecatedPrintButton sides="two-sided-long-edge" afterPrint={afterPrint}>
      Print Now
    </DeprecatedPrintButton>,
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
    fakePrinterInfo({ connected: false }),
    fakePrinterInfo({ name: 'VxPrinter', connected: true }),
  ]);

  const printer = fakePrinter();
  const afterPrint = jest.fn();
  const { getByText } = renderInAppContext(
    <DeprecatedPrintButton afterPrint={afterPrint} sides="two-sided-long-edge">
      Print Now
    </DeprecatedPrintButton>,
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

test('if passed a printTarget, render for printing', async () => {
  const mockKiosk = window.kiosk! as jest.Mocked<KioskBrowser.Kiosk>;
  mockKiosk.getPrinterInfo.mockResolvedValue([
    fakePrinterInfo({ connected: false }),
    fakePrinterInfo({ name: 'VxPrinter', connected: true }),
  ]);

  const printer = fakePrinter();
  const printTarget = <p>Print Target</p>;
  const printTargetTestId = 'print-target';
  const { getByTestId, getByText, queryByText } = renderInAppContext(
    <DeprecatedPrintButton
      sides="two-sided-long-edge"
      printTarget={printTarget}
      printTargetTestId={printTargetTestId}
    >
      Print Now
    </DeprecatedPrintButton>,
    { printer }
  );

  const printDeferred = deferred<void>();
  printer.print.mockReturnValueOnce(printDeferred.promise);
  fireEvent.click(getByText('Print Now'));

  // Check that printTarget is rendered before printing
  await waitFor(() => {
    const renderedPrintTarget = getByTestId('print-target');
    domGetByText(renderedPrintTarget, 'Print Target');
    expect(printer.print).not.toBeCalled();
  });

  // Check that printTarget is still rendered after printing
  await waitFor(() => {
    expect(printer.print).toBeCalled();
    getByText('Print Target');
  });

  // Allow `printer.print` to resolve
  printDeferred.resolve();

  // Check that printTarget is removed after printing
  await waitForElementToBeRemoved(() => queryByText('Print Target'));
});
