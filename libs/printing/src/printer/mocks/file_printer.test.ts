import { Buffer } from 'buffer';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { sleep } from '@votingworks/basics';
import {
  DEFAULT_MOCK_USB_DRIVE_DIR,
  MockFilePrinter,
  getMockFilePrinterHandler,
} from './file_printer';
import { HP_LASER_PRINTER_CONFIG } from '..';

beforeEach(() => {
  getMockFilePrinterHandler().cleanup();
});

test('mock file printer', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2021-01-01T00:00:00Z'));
  const filePrinter = new MockFilePrinter();
  const filePrinterHandler = getMockFilePrinterHandler();

  expect(await filePrinter.status()).toEqual({ connected: false });
  await expect(
    filePrinter.print({ data: Buffer.from('test') })
  ).rejects.toThrow();

  filePrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  expect(await filePrinter.status()).toEqual({
    connected: true,
    config: HP_LASER_PRINTER_CONFIG,
  });

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
  expect(await filePrinter.status()).toEqual({ connected: false });

  filePrinterHandler.cleanup();
  expect(existsSync(DEFAULT_MOCK_USB_DRIVE_DIR)).toEqual(false);
});
