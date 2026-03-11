import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { Optional, assert, iter } from '@votingworks/basics';
import { writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { PrinterConfig, PrinterStatus } from '@votingworks/types';
import { getMockStateRootDir } from '@votingworks/utils';
import { PrintProps, PrintSides, Printer } from '../types';
import { getMockConnectedPrinterStatus } from './fixtures';

export const MOCK_PRINTER_STATE_FILENAME = 'state.json';
// libs/printing/src/printer/mocks/ is 5 levels below the repo root
const REPO_ROOT = join(__dirname, '../../../../..');
export const MOCK_HP_PRINTER_DIR = join(
  getMockStateRootDir(REPO_ROOT),
  'hp-printer'
);
export const MOCK_PRINTER_OUTPUT_DIR = join(
  getMockStateRootDir(REPO_ROOT),
  'prints'
);

function getMockPrinterPath(): string {
  return MOCK_HP_PRINTER_DIR;
}

const MAX_PRINTS = 100;

function trimOldPrints(): void {
  if (!existsSync(MOCK_PRINTER_OUTPUT_DIR)) return;
  const files = readdirSync(MOCK_PRINTER_OUTPUT_DIR, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((f) => join(MOCK_PRINTER_OUTPUT_DIR, f.name))
    .sort(
      (a, b) => lstatSync(a).ctime.getTime() - lstatSync(b).ctime.getTime()
    );
  for (const file of files.slice(0, Math.max(0, files.length - MAX_PRINTS))) {
    rmSync(file);
  }
}

type MockStateFileContents = PrinterStatus;

function getMockPrinterStateFilePath(): string {
  return join(getMockPrinterPath(), MOCK_PRINTER_STATE_FILENAME);
}

function getMockPrinterOutputPath(): string {
  return MOCK_PRINTER_OUTPUT_DIR;
}

/**
 * Converts a MockFileContents object into a Buffer
 */
function serializeMockFileContents(
  mockStateFileContents: MockStateFileContents
): Buffer {
  return Buffer.from(JSON.stringify(mockStateFileContents), 'utf-8');
}

/**
 * Converts a Buffer created by serializeMockFileContents back into a MockFileContents object
 */
function deserializeMockFileContents(file: Buffer): MockStateFileContents {
  return JSON.parse(file.toString('utf-8'));
}

function writeToMockFile(mockStateFileContents: MockStateFileContents): void {
  mkdirSync(getMockPrinterPath(), { recursive: true });
  writeFileSync(
    getMockPrinterStateFilePath(),
    serializeMockFileContents(mockStateFileContents)
  );
  // Create the output directory whenever we write to the state file, so that
  // it's there before any prints are created
  mkdirSync(getMockPrinterOutputPath(), { recursive: true });
}

export function initializeMockFile(): void {
  writeToMockFile({
    connected: false,
  });
}

/**
 * A helper for readFromMockFile. Returns undefined if the mock file doesn't exist or can't be
 * parsed.
 */
function readFromMockFileHelper(): Optional<MockStateFileContents> {
  const mockFilePath = getMockPrinterStateFilePath();
  if (!existsSync(mockFilePath)) {
    return undefined;
  }
  const file = readFileSync(mockFilePath);
  try {
    return deserializeMockFileContents(file);
  } catch {
    /* istanbul ignore next - @preserve */
    return undefined;
  }
}

/**
 * Reads and parses the contents of the file underlying a MockFilePrinter
 */
function readFromMockFile(): MockStateFileContents {
  let mockFileContents = readFromMockFileHelper();
  if (!mockFileContents) {
    initializeMockFile();
    mockFileContents = readFromMockFileHelper();
    assert(mockFileContents !== undefined);
  }
  return mockFileContents;
}

export class MockFilePrinter implements Printer {
  status(): Promise<PrinterStatus> {
    return Promise.resolve(readFromMockFile());
  }

  async print(props: PrintProps): Promise<void> {
    const status = readFromMockFile();
    if (!status.connected) {
      throw new Error('cannot print without printer connected');
    }

    const { data, sides } = props;
    const filename = join(
      getMockPrinterOutputPath(),
      `print-job-${new Date().toISOString()}.pdf`
    );

    if (sides === PrintSides.OneSided) {
      // Simulate single-sided printing by inserting a blank page after each
      // content page, representing the blank back of each physical sheet.
      try {
        /* istanbul ignore next - @preserve */
        const pdfBytes =
          data instanceof Uint8Array ? data : Buffer.from(data as Buffer);
        const pdf = await PDFDocument.load(pdfBytes);
        const pageCount = pdf.getPageCount();

        for (let i = pageCount - 1; i >= 0; i -= 1) {
          const existingPage = pdf.getPage(i);
          const { width, height } = existingPage.getSize();
          pdf.insertPage(i + 1, [width, height]);
        }
        const modifiedBytes = await pdf.save();
        await writeFile(filename, modifiedBytes);
        return;
      } catch {
        // Data is not a valid PDF, write as-is
      }
    }

    await writeFile(filename, data);
  }
}

export interface MockFilePrinterHandler {
  connectPrinter: (config: PrinterConfig) => void;
  disconnectPrinter: () => void;
  getPrinterStatus(): PrinterStatus;
  getDataPath: () => string;
  getLastPrintPath: () => Optional<string>;
  cleanup: () => void;
}

export function getMockFilePrinterHandler(): MockFilePrinterHandler {
  trimOldPrints();
  return {
    connectPrinter: (config: PrinterConfig) => {
      writeToMockFile(getMockConnectedPrinterStatus(config));
    },
    disconnectPrinter: () => {
      writeToMockFile({
        connected: false,
      });
    },
    getPrinterStatus: () => readFromMockFile(),
    getDataPath: getMockPrinterOutputPath,
    getLastPrintPath() {
      const printPaths = readdirSync(getMockPrinterOutputPath(), {
        withFileTypes: true,
      })
        .filter((dirent) => dirent.isFile())
        .map((file) => join(getMockPrinterOutputPath(), file.name));

      return iter(printPaths).maxBy((filePath) =>
        lstatSync(filePath).ctime.getTime()
      );
    },
    cleanup: () => {
      rmSync(MOCK_HP_PRINTER_DIR, { recursive: true, force: true });
      rmSync(MOCK_PRINTER_OUTPUT_DIR, { recursive: true, force: true });
    },
  };
}
