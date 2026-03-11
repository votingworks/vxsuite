import { Optional, assert, err, iter, ok, sleep } from '@votingworks/basics';
import { ImageData, writeImageData } from '@votingworks/image-utils';
import { LogEventId, Logger } from '@votingworks/logging';
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
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getMockStateRootDir } from '@votingworks/utils';
import { logPrinterStatusIfChanged } from '../logging';
import {
  FujitsuThermalPrinterInterface,
  PrintResult,
  PrinterStatus,
} from '../types';

export const MOCK_FUJITSU_PRINTER_STATE_FILENAME = 'state.json';
// libs/fujitsu-thermal-printer/src/mocks/ is 4 levels below the repo root
const REPO_ROOT = join(__dirname, '../../../..');
export const MOCK_FUJITSU_PRINTER_DIR = join(
  getMockStateRootDir(REPO_ROOT),
  'fujitsu-printer'
);
export const MOCK_PRINTER_OUTPUT_DIR = join(
  getMockStateRootDir(REPO_ROOT),
  'prints'
);

function getMockPrinterPath(): string {
  return MOCK_FUJITSU_PRINTER_DIR;
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
  return join(getMockPrinterPath(), MOCK_FUJITSU_PRINTER_STATE_FILENAME);
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
    state: 'idle',
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
    /* istanbul ignore next */
    return undefined;
  }
}

/**
 * Reads and parses the contents of the file underlying a MockFileUsbDrive
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

interface MockFileFujitsuPrinterPollingConfig {
  interval: number;
  timeout: number;
}

const DEFAULT_FILE_FUJITSU_PRINT_POLLING_CONFIG: MockFileFujitsuPrinterPollingConfig =
  {
    interval: 1000,
    timeout: 5000,
  };

export class MockFileFujitsuPrinter implements FujitsuThermalPrinterInterface {
  private readonly printPollingConfig: MockFileFujitsuPrinterPollingConfig;
  private lastKnownStatus?: PrinterStatus;

  constructor(
    private readonly logger: Logger,
    printPollingConfig = DEFAULT_FILE_FUJITSU_PRINT_POLLING_CONFIG
  ) {
    this.printPollingConfig = printPollingConfig;
  }

  async getStatus(): Promise<PrinterStatus> {
    const newPrinterStatus = await Promise.resolve(readFromMockFile());
    logPrinterStatusIfChanged(
      this.logger,
      this.lastKnownStatus,
      newPrinterStatus || null
    );
    this.lastKnownStatus = newPrinterStatus || null;
    return newPrinterStatus;
  }

  printPdf(data: Uint8Array): Promise<PrintResult> {
    return this.mockPrintJob((filename) => writeFile(`${filename}.pdf`, data));
  }

  async printImageData(imageData: ImageData): Promise<PrintResult> {
    return this.mockPrintJob((filename) =>
      writeImageData(`${filename}.png`, imageData)
    );
  }

  private async mockPrintJob(
    writeData: (filename: string) => Promise<void>
  ): Promise<PrintResult> {
    void this.logger.logAsCurrentRole(LogEventId.PrinterPrintRequest, {
      message: 'Initiating print',
    });
    const initialStatus = readFromMockFile();
    if (initialStatus.state !== 'idle') {
      void this.logger.logAsCurrentRole(LogEventId.PrinterPrintComplete, {
        message: 'Printer not in an idle state, can not print.',
        state: JSON.stringify(initialStatus.state),
        disposition: 'failure',
      });
      throw new Error('can only print when printer is idle');
    }

    // To allow mocking failed prints, if the printer status changes during
    // the print, fail the print just as the real printer would.
    if (this.printPollingConfig.timeout > 0) {
      let elapsedTime = 0;
      while (elapsedTime < this.printPollingConfig.timeout) {
        await sleep(this.printPollingConfig.interval);
        elapsedTime += this.printPollingConfig.interval;

        const currentStatus = readFromMockFile();
        if (currentStatus.state !== 'idle') {
          void this.logger.logAsCurrentRole(LogEventId.PrinterPrintComplete, {
            message: 'Printer not in an idle state, can not print.',
            state: JSON.stringify(currentStatus.state),
            disposition: 'failure',
          });
          return err(currentStatus);
        }
      }
    }

    const filename = join(
      getMockPrinterOutputPath(),
      `print-job-${new Date().toISOString()}`
    );
    await writeData(filename);

    void this.logger.logAsCurrentRole(LogEventId.PrinterPrintComplete, {
      message: 'Print job completed successfully',
      disposition: 'success',
    });
    return ok();
  }
}

interface MockFileFujitsuPrinterHandler {
  setStatus: (status: PrinterStatus) => void;
  getPrinterStatus(): PrinterStatus;
  getDataPath: () => string;
  getLastPrintPath: () => Optional<string>;
  cleanup: () => void;
}

export function getMockFileFujitsuPrinterHandler(): MockFileFujitsuPrinterHandler {
  trimOldPrints();
  return {
    setStatus: (status: PrinterStatus) => {
      writeToMockFile(status);
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
      rmSync(MOCK_FUJITSU_PRINTER_DIR, { recursive: true, force: true });
      rmSync(MOCK_PRINTER_OUTPUT_DIR, { recursive: true, force: true });
    },
  };
}
