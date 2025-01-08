import { Buffer } from 'node:buffer';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { sleep } from '@votingworks/basics';
import { PrinterStatus } from '@votingworks/types';
import {
  DEFAULT_MOCK_PRINTER_DIR,
  MockFilePrinter,
  getMockFilePrinterHandler,
} from './file_printer';
import { HP_LASER_PRINTER_CONFIG } from '../supported';
import { MOCK_PRINTER_RICH_STATUS } from './fixtures';

beforeEach(() => {
  getMockFilePrinterHandler().cleanup();
});

test('mock file printer', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2021-01-01T00:00:00Z'));
  const filePrinter = new MockFilePrinter();
  const filePrinterHandler = getMockFilePrinterHandler();

  expect(await filePrinter.status()).toEqual<PrinterStatus>({
    connected: false,
  });
  expect(filePrinterHandler.getPrinterStatus()).toEqual(
    await filePrinter.status()
  );
  await expect(
    filePrinter.print({ data: Buffer.from('test') })
  ).rejects.toThrow();

  filePrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  expect(await filePrinter.status()).toEqual<PrinterStatus>({
    connected: true,
    config: HP_LASER_PRINTER_CONFIG,
    richStatus: MOCK_PRINTER_RICH_STATUS,
  });
  expect(filePrinterHandler.getPrinterStatus()).toEqual(
    await filePrinter.status()
  );

  await filePrinter.print({ data: Buffer.from('print-1') });

  // skip real time between prints to ensure that the print job time is different
  jest.useRealTimers();
  await sleep(100);
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2021-01-01T00:00:01Z'));

  await filePrinter.print({ data: Buffer.from('print-2') });

  expect(filePrinterHandler.getDataPath()).toEqual('/tmp/mock-printer/prints');
  expect(readdirSync(filePrinterHandler.getDataPath())).toEqual([
    'print-job-2021-01-01T00:00:00.000Z.pdf',
    'print-job-2021-01-01T00:00:01.000Z.pdf',
  ]);
  expect(filePrinterHandler.getLastPrintPath()).toEqual(
    '/tmp/mock-printer/prints/print-job-2021-01-01T00:00:01.000Z.pdf'
  );

  expect(readFileSync(filePrinterHandler.getLastPrintPath()!, 'utf-8')).toEqual(
    'print-2'
  );

  filePrinterHandler.disconnectPrinter();
  expect(await filePrinter.status()).toEqual<PrinterStatus>({
    connected: false,
  });
  expect(filePrinterHandler.getPrinterStatus()).toEqual(
    await filePrinter.status()
  );

  filePrinterHandler.cleanup();
  expect(existsSync(DEFAULT_MOCK_PRINTER_DIR)).toEqual(false);
});
