import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { HP_LASER_PRINTER_CONFIG, PrintSides } from '..';
import { createMockPrinterHandler } from './memory_printer';
import { MOCK_PRINTER_RICH_STATUS } from './fixtures';

test('memory printer', async () => {
  const printerHandler = createMockPrinterHandler();
  const { printer } = printerHandler;

  expect(await printer.status()).toEqual({ connected: false });
  await expect(printer.print({ data: Buffer.from('') })).rejects.toThrow();

  const config = HP_LASER_PRINTER_CONFIG;
  printerHandler.connectPrinter(config);
  expect(await printer.status()).toEqual({
    connected: true,
    config,
    richStatus: MOCK_PRINTER_RICH_STATUS,
  });

  expect(printerHandler.getPrintJobHistory()).toEqual([]);
  expect(printerHandler.getLastPrintPath()).toBeUndefined();

  const print1 = Buffer.from('print1');
  await printer.print({ data: print1, copies: 1, sides: PrintSides.OneSided });
  const printJobs1 = printerHandler.getPrintJobHistory();
  expect(printJobs1).toHaveLength(1);
  const [printJob1] = printJobs1;
  expect(printJob1).toEqual({
    filename: expect.stringMatching(/^\/tmp\/mock-print-job-.*\.pdf$/),
    options: { copies: 1, sides: PrintSides.OneSided },
  });
  expect(printerHandler.getLastPrintPath()).toEqual(printJob1.filename);
  expect((await readFile(printJob1.filename, 'utf8')).toString()).toEqual(
    'print1'
  );

  const print2 = Buffer.from('print2');
  await printer.print({ data: print2, raw: { 'fit-to-page': 'true' } });
  const printJobs2 = printerHandler.getPrintJobHistory();
  expect(printJobs2).toHaveLength(2);
  expect(printJobs2[0]).toEqual(printJob1);
  const [, printJob2] = printJobs2;
  expect(printJob2).toEqual({
    filename: expect.stringMatching(/^\/tmp\/mock-print-job-.*\.pdf$/),
    options: { raw: { 'fit-to-page': 'true' } },
  });
  expect(printerHandler.getLastPrintPath()).toEqual(printJob2.filename);
  expect((await readFile(printJob2.filename, 'utf8')).toString()).toEqual(
    'print2'
  );

  printerHandler.disconnectPrinter();
  expect(await printer.status()).toEqual({ connected: false });

  printerHandler.cleanup();
  expect(existsSync(printJob1.filename)).toEqual(false);
  expect(existsSync(printJob2.filename)).toEqual(false);
});
