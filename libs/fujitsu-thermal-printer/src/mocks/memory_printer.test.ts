import { Buffer } from 'node:buffer';
import { err, ok } from '@votingworks/basics';
import { existsSync, readFileSync } from 'node:fs';
import { createMockFujitsuPrinterHandler } from './memory_printer';
import { PrinterStatus } from '../types';

test('status management', async () => {
  const printerHandler = createMockFujitsuPrinterHandler();
  const { printer } = printerHandler;
  expect(await printer.getStatus()).toEqual<PrinterStatus>({
    state: 'idle',
  });

  printerHandler.setStatus({
    state: 'no-paper',
  });
  expect(await printer.getStatus()).toEqual<PrinterStatus>({
    state: 'no-paper',
  });

  printerHandler.setStatus({
    state: 'idle',
  });
  expect(await printer.getStatus()).toEqual<PrinterStatus>({
    state: 'idle',
  });
});

test('printing', async () => {
  const printerHandler = createMockFujitsuPrinterHandler();
  const { printer } = printerHandler;

  expect(printerHandler.getPrintPathHistory()).toHaveLength(0);
  expect(printerHandler.getLastPrintPath()).toBeUndefined();

  expect(await printer.print(Buffer.from('Print Content 1'))).toEqual(ok());
  expect(await printer.print(Buffer.from('Print Content 2'))).toEqual(ok());

  const printPaths = printerHandler.getPrintPathHistory();
  expect(printPaths).toHaveLength(2);
  expect(readFileSync(printPaths[0]!)).toEqual(Buffer.from('Print Content 1'));
  expect(readFileSync(printPaths[1]!)).toEqual(Buffer.from('Print Content 2'));
  expect(printerHandler.getLastPrintPath()).toEqual(printPaths[1]);

  printerHandler.cleanup();
  expect(printerHandler.getPrintPathHistory()).toHaveLength(0);
  expect(printerHandler.getLastPrintPath()).toBeUndefined();
  expect(existsSync(printPaths[0]!)).toEqual(false);
  expect(existsSync(printPaths[1]!)).toEqual(false);
});

test('print fails if printer is not idle', async () => {
  const printerHandler = createMockFujitsuPrinterHandler();
  const { printer } = printerHandler;

  printerHandler.setStatus({
    state: 'cover-open',
  });

  expect(await printer.print(Buffer.from('Print Content'))).toEqual(
    err({
      state: 'cover-open',
    })
  );
});
