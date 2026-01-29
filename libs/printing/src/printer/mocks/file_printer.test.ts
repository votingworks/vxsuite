import { beforeEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { sleep } from '@votingworks/basics';
import { PDFDocument } from 'pdf-lib';
import { PrinterStatus } from '@votingworks/types';
import {
  DEFAULT_MOCK_PRINTER_DIR,
  MockFilePrinter,
  getMockFilePrinterHandler,
} from './file_printer';
import { HP_LASER_PRINTER_CONFIG } from '../supported';
import { PrintSides } from '../types';
import { MOCK_PRINTER_RICH_STATUS } from './fixtures';

beforeEach(() => {
  getMockFilePrinterHandler().cleanup();
});

test('mock file printer', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2021-01-01T00:00:00Z'));
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
  vi.useRealTimers();
  await sleep(100);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2021-01-01T00:00:01Z'));

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

async function createTestPdf(pageCount: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    pdf.addPage([612, 792]); // Letter size
  }
  return pdf.save();
}

test('single-sided printing inserts blank page after single-page PDF', async () => {
  const filePrinter = new MockFilePrinter();
  const handler = getMockFilePrinterHandler();
  handler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  const pdfData = await createTestPdf(1);
  await filePrinter.print({ data: pdfData, sides: PrintSides.OneSided });

  const outputPath = handler.getLastPrintPath()!;
  const outputPdf = await PDFDocument.load(readFileSync(outputPath));
  expect(outputPdf.getPageCount()).toEqual(2);

  // Blank page should match dimensions of the content page
  const contentPage = outputPdf.getPage(0);
  const blankPage = outputPdf.getPage(1);
  expect(blankPage.getSize()).toEqual(contentPage.getSize());
});

test('single-sided printing inserts blank pages after each page of multi-page PDF', async () => {
  const filePrinter = new MockFilePrinter();
  const handler = getMockFilePrinterHandler();
  handler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  const pdfData = await createTestPdf(3);
  await filePrinter.print({ data: pdfData, sides: PrintSides.OneSided });

  const outputPath = handler.getLastPrintPath()!;
  const outputPdf = await PDFDocument.load(readFileSync(outputPath));
  expect(outputPdf.getPageCount()).toEqual(6);
});

test('two-sided printing does not insert blank pages', async () => {
  const filePrinter = new MockFilePrinter();
  const handler = getMockFilePrinterHandler();
  handler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  const pdfData = await createTestPdf(2);
  await filePrinter.print({
    data: pdfData,
    sides: PrintSides.TwoSidedLongEdge,
  });

  const outputPath = handler.getLastPrintPath()!;
  const outputPdf = await PDFDocument.load(readFileSync(outputPath));
  expect(outputPdf.getPageCount()).toEqual(2);
});
