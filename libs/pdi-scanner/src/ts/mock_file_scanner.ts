import { iter } from '@votingworks/basics';
import {
  ImageData,
  RGBA_CHANNEL_COUNT,
  pdfToImages,
} from '@votingworks/image-utils';
import { asSheet, SheetOf } from '@votingworks/types';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  MockPdiScannerDelays,
  MockScanner,
  MockSheetStatus,
  createMockPdiScanner,
} from './mock_scanner';

// Build output is flat at libs/pdi-scanner/build/; 3 levels up is the repo root.
const REPO_ROOT = join(__dirname, '../../..');
const MOCK_STATE_DIR = join(
  REPO_ROOT,
  '.mock-state',
  process.env['NODE_ENV'] ?? 'development',
  'pdi-scanner'
);
const COMMAND_FILE = join(MOCK_STATE_DIR, 'command.json');

/**
 * Reshapes RGBA image data into the grayscale (one byte per pixel) image data
 * the real scanner client emits (see `scanner_client.ts`), so that mock scans
 * exercise the same downstream image handling as real hardware.
 */
function toGrayscaleImageData({ width, height, data }: ImageData): ImageData {
  const pixels = new Uint8ClampedArray(width * height);
  for (let i = 0; i < pixels.length; i += 1) {
    pixels[i] = data[i * RGBA_CHANNEL_COUNT] as number;
  }
  return grayscaleImageData(width, height, pixels);
}

function blankGrayscalePage(width: number, height: number): ImageData {
  return grayscaleImageData(
    width,
    height,
    new Uint8ClampedArray(width * height).fill(0xff)
  );
}

interface LoggableImageData extends ImageData {
  toJSON(): string;
}

function grayscaleImageData(
  width: number,
  height: number,
  data: Uint8ClampedArray
): ImageData {
  const image: LoggableImageData = {
    width,
    height,
    data,

    // Define `toJSON` such that `JSON.stringify` does not try to serialize
    // all the bytes in `data` as an array of numbers, matching the real
    // scanner client (see `scanner_client.ts`).
    // eslint-disable-next-line vx/gts-identifiers
    toJSON: () => `[ImageData ${width}x${height}]`,
  };
  return image;
}

type Command =
  | { type: 'insert'; path: string }
  | { type: 'remove' }
  | { type: 'none' };

function writeCommand(command: Command): void {
  mkdirSync(MOCK_STATE_DIR, { recursive: true });
  writeFileSync(COMMAND_FILE, JSON.stringify(command), 'utf-8');
}

function readCommand(): Command {
  if (!existsSync(COMMAND_FILE)) {
    return { type: 'none' };
  }
  try {
    return JSON.parse(readFileSync(COMMAND_FILE, 'utf-8')) as Command;
  } catch {
    /* istanbul ignore next */
    return { type: 'none' };
  }
}

/** Handler for controlling the file-based PDI scanner mock from the test process. */
export interface MockFilePdiScannerHandler {
  insertSheet(path: string): void;
  removeSheet(): void;
  cleanup(): void;
}

/** Returns a handler for controlling the file-based PDI scanner mock from the test process. */
export function getMockFilePdiScannerHandler(): MockFilePdiScannerHandler {
  return {
    insertSheet(path: string): void {
      writeCommand({ type: 'insert', path });
    },
    removeSheet(): void {
      writeCommand({ type: 'remove' });
    },
    cleanup(): void {
      rmSync(MOCK_STATE_DIR, { recursive: true, force: true });
    },
  };
}

// Faster delays for integration tests so the test suite doesn't wait on
// realistic hardware timing. Still long enough to capture transition screenshots.
const INTEGRATION_TEST_DELAYS: MockPdiScannerDelays = {
  scanDelay: 200,
  ejectDelay: 200,
  commandDelay: 25,
};

/**
 * Creates a {@link MockScanner} backed by a command file on disk. The backend
 * process polls the file and delegates to an inner in-memory mock scanner, so
 * the test process can control scanning without HTTP or shared memory.
 */
export function createMockFilePdiScanner(): MockScanner {
  const inner = createMockPdiScanner(
    process.env['IS_INTEGRATION_TEST'] === 'true'
      ? INTEGRATION_TEST_DELAYS
      : undefined
  );
  let pollInterval: ReturnType<typeof setInterval> | undefined;

  function startPolling(): void {
    pollInterval = setInterval(() => {
      const command = readCommand();
      if (command.type === 'none') return;

      // Clear the command immediately so we don't process it twice
      writeCommand({ type: 'none' });

      if (command.type === 'remove') {
        inner.removeSheet();
        return;
      }

      // command.type === 'insert'
      void (async () => {
        const pdfData = Uint8Array.from(readFileSync(command.path));
        // Wait until the inner mock scanner is ready to accept a sheet.
        // The outer state machine calls enableScanning() asynchronously, so
        // we may need to wait a bit before the inner mock is in the right state.
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (inner.getSheetStatus() === 'noSheetEnabled') {
              clearInterval(check);
              resolve();
            }
          }, 50);
        });
        for await (const sheet of iter(
          pdfToImages(pdfData, { scale: 200 / 72 })
        )
          .map(({ page }: { page: ImageData }) => toGrayscaleImageData(page))
          .chunks(2)
          .map((pages: [ImageData] | [ImageData, ImageData]) => {
            const front = pages[0];
            const back =
              pages[1] ?? blankGrayscalePage(front.width, front.height);
            return asSheet([front, back]);
          })) {
          inner.insertSheet(sheet);
        }
      })().catch((err) => {
        // Re-throw on next tick so the backend process crashes loudly instead
        // of leaving the test hanging with no indication of what went wrong.
        process.nextTick(() => {
          throw err;
        });
      });
    }, 100);
  }

  startPolling();

  return {
    get client() {
      return inner.client;
    },
    insertSheet(images: SheetOf<ImageData>): void {
      inner.insertSheet(images);
    },
    removeSheet(): void {
      inner.removeSheet();
    },
    getSheetStatus(): MockSheetStatus {
      return inner.getSheetStatus();
    },
    async cleanup(): Promise<void> {
      if (pollInterval !== undefined) {
        clearInterval(pollInterval);
        pollInterval = undefined;
      }
      await inner.cleanup();
    },
  };
}
