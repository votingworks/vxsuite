import { Buffer } from 'node:buffer';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { err, ok } from '@votingworks/basics';
import { LogEventId, mockLogger } from '@votingworks/logging';
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
  const logger = mockLogger({ fn: jest.fn });
  const filePrinter = new MockFileFujitsuPrinter(logger);
  const filePrinterHandler = getMockFileFujitsuPrinterHandler();

  expect(await filePrinter.getStatus()).toEqual<PrinterStatus>({
    state: 'idle',
  });
  expect(filePrinterHandler.getPrinterStatus()).toEqual(
    await filePrinter.getStatus()
  );
  expect(logger.log).toBeCalledTimes(1);
  expect(logger.log).toBeCalledWith(LogEventId.PrinterStatusChanged, 'system', {
    message: expect.anything(),
    status: JSON.stringify({ state: 'idle' }),
    disposition: 'success',
  });

  filePrinterHandler.setStatus({
    state: 'no-paper',
  });
  expect(await filePrinter.getStatus()).toEqual<PrinterStatus>({
    state: 'no-paper',
  });
  expect(filePrinterHandler.getPrinterStatus()).toEqual(
    await filePrinter.getStatus()
  );
  expect(logger.log).toBeCalledTimes(2);
  expect(logger.log).lastCalledWith(LogEventId.PrinterStatusChanged, 'system', {
    message: expect.anything(),
    status: JSON.stringify({ state: 'no-paper' }),
    disposition: 'success',
  });
});

test('fails printing if not initial idle', async () => {
  const logger = mockLogger({ fn: jest.fn });
  const filePrinter = new MockFileFujitsuPrinter(logger);
  const filePrinterHandler = getMockFileFujitsuPrinterHandler();

  filePrinterHandler.setStatus({
    state: 'no-paper',
  });

  await expect(filePrinter.print(Buffer.from('test'))).rejects.toThrow();
  expect(logger.log).toBeCalledTimes(2);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.PrinterPrintRequest,
    'unknown',
    {
      message: expect.anything(),
    }
  );
  expect(logger.log).lastCalledWith(
    LogEventId.PrinterPrintComplete,
    'unknown',
    expect.objectContaining({ disposition: 'failure' })
  );
});

test('successful printing', async () => {
  const logger = mockLogger({ fn: jest.fn });
  // set a short print polling interval to speed up the test
  const filePrinter = new MockFileFujitsuPrinter(logger, {
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
  expect(logger.log).toBeCalledTimes(4);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.PrinterPrintRequest,
    'unknown',
    expect.anything()
  );
  expect(logger.log).lastCalledWith(
    LogEventId.PrinterPrintComplete,
    'unknown',
    expect.objectContaining({ disposition: 'success' })
  );
});

test('failed print', async () => {
  const logger = mockLogger({ fn: jest.fn });
  // set a short print polling interval to speed up the test
  const filePrinter = new MockFileFujitsuPrinter(logger, {
    interval: 50,
    timeout: 250,
  });
  const filePrinterHandler = getMockFileFujitsuPrinterHandler();

  const print1Promise = filePrinter.print(Buffer.from('print-1'));
  filePrinterHandler.setStatus({
    state: 'no-paper',
  });
  expect(await print1Promise).toEqual(err({ state: 'no-paper' }));
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.PrinterPrintRequest,
    'unknown',
    {
      message: expect.anything(),
    }
  );
  expect(logger.log).lastCalledWith(
    LogEventId.PrinterPrintComplete,
    'unknown',
    expect.objectContaining({ disposition: 'failure' })
  );
});
