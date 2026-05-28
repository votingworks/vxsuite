import { iter } from '@votingworks/basics';
import {
  ImageData,
  createImageData,
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
    /* istanbul ignore next - @preserve */
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

/**
 * Creates a {@link MockScanner} backed by a command file on disk. The backend
 * process polls the file and delegates to an inner in-memory mock scanner, so
 * the test process can control scanning without HTTP or shared memory.
 */
export function createMockFilePdiScanner(): MockScanner {
  const inner = createMockPdiScanner();
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
          .map(({ page }: { page: ImageData }) => page)
          .chunks(2)
          .map((pages: [ImageData] | [ImageData, ImageData]) => {
            const front = pages[0];
            const back = pages[1] ?? createImageData(front.width, front.height);
            return asSheet([front, back]);
          })) {
          inner.insertSheet(sheet);
        }
      })().catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[MockFilePdiScanner] Error inserting sheet:', err);
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
