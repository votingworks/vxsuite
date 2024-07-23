import { Buffer } from 'buffer';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { err, ok } from '@votingworks/basics';
import {
  DEFAULT_MOCK_FUJITSU_PRINTER_DIR,
  MockFileFujitsuPrinter,
  getMockFileFujitsuPrinterHandler,
} from './file_printer';
import { PrinterStatus } from '../types';

beforeEach(() => {
  getMockFileFujitsuPrinterHandler().cleanup();
});

test('status management', async () => {
  const filePrinter = new MockFileFujitsuPrinter();
  const filePrinterHandler = getMockFileFujitsuPrinterHandler();

  expect(await filePrinter.getStatus()).toEqual<PrinterStatus>({
    state: 'idle',
  });
  expect(filePrinterHandler.getPrinterStatus()).toEqual(
    await filePrinter.getStatus()
  );

  filePrinterHandler.setStatus({
    state: 'no-paper',
  });
  expect(await filePrinter.getStatus()).toEqual<PrinterStatus>({
    state: 'no-paper',
  });
  expect(filePrinterHandler.getPrinterStatus()).toEqual(
    await filePrinter.getStatus()
  );
});

test('fails printing if not initial idle', async () => {
  const filePrinter = new MockFileFujitsuPrinter();
  const filePrinterHandler = getMockFileFujitsuPrinterHandler();

  filePrinterHandler.setStatus({
    state: 'no-paper',
  });

  await expect(filePrinter.print(Buffer.from('test'))).rejects.toThrow();
});

test('successful printing', async () => {
  // set a short print polling interval to speed up the test
  const filePrinter = new MockFileFujitsuPrinter({
    interval: 50,
    timeout: 250,
  });
  const filePrinterHandler = getMockFileFujitsuPrinterHandler();

  const print1Promise = filePrinter.print(Buffer.from('print-1'));
  expect(await print1Promise).toEqual(ok());

  const print2Promise = filePrinter.print(Buffer.from('print-2'));
  expect(await print2Promise).toEqual(ok());

  expect(filePrinterHandler.getDataPath()).toEqual(
    '/tmp/mock-fujitsu-printer/prints'
  );
  expect(readdirSync(filePrinterHandler.getDataPath())).toHaveLength(2);
  expect(filePrinterHandler.getLastPrintPath()).toMatch(
    /\/tmp\/mock-fujitsu-printer\/prints\/print-job-.*\.pdf/
  );

  expect(readFileSync(filePrinterHandler.getLastPrintPath()!, 'utf-8')).toEqual(
    'print-2'
  );

  filePrinterHandler.cleanup();
  expect(existsSync(DEFAULT_MOCK_FUJITSU_PRINTER_DIR)).toEqual(false);
});

test('failed print', async () => {
  // set a short print polling interval to speed up the test
  const filePrinter = new MockFileFujitsuPrinter({
    interval: 50,
    timeout: 250,
  });
  const filePrinterHandler = getMockFileFujitsuPrinterHandler();

  const print1Promise = filePrinter.print(Buffer.from('print-1'));
  filePrinterHandler.setStatus({
    state: 'no-paper',
  });
  expect(await print1Promise).toEqual(err({ state: 'no-paper' }));
});
