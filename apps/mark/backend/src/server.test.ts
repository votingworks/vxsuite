import {
  afterEach,
  beforeEach,
  expect,
  type MockedFunction,
  test,
  vi,
} from 'vitest';
import { mockBaseLogger } from '@votingworks/logging';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import type { Application } from 'express';
import { expectToHaveBeenCalledWith } from '@votingworks/test-utils/expect';
import { start } from './server.js';
import { createWorkspace, type Workspace } from './util/workspace.js';
import { buildApp } from './app.js';
import { getMockAudioPlayer, newAudioPlayer } from './audio/player.js';
import { buildMockLogger } from '../test/app_helpers.js';

vi.mock(import('@votingworks/usb-drive'), async (importActual) => {
  const actual = await importActual();
  const fixtures = await import('@votingworks/fixtures');
  return {
    ...actual,
    detectUsbDriveFromEnv: ({ logger }) =>
      actual.detectUsbDrive({
        logger,
        platform: new actual.SimulatedUsbPlatform(
          fixtures.makeTemporaryDirectory()
        ),
      }),
  };
});

vi.mock('./app');
vi.mock('./barcodes', async () => {
  // vi.mock factories are hoisted above imports, so the top-level
  // `mockConstructor` is in TDZ here — resolve test-utils lazily and alias
  // to avoid shadowing the outer import.
  const { mockConstructor: mockCtor } = await import('@votingworks/test-utils');
  return {
    BarcodeClient: vi.fn().mockImplementation(
      mockCtor(() => ({
        on: vi.fn(),
        shutDown: vi.fn().mockResolvedValue(undefined),
        getConnectionStatus: vi.fn().mockReturnValue(false),
      }))
    ),
  };
});

vi.mock(import('./audio/player.js'), async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    newAudioPlayer: vi.fn(),
  };
});

const buildAppMock = buildApp as MockedFunction<typeof buildApp>;

const mockAudioPlayerInit = vi.mocked(newAudioPlayer);

let workspace!: Workspace;

beforeEach(() => {
  workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );
});

afterEach(() => {
  workspace[Symbol.dispose]();
});

test('start passes context to `buildApp`', async () => {
  const listen = vi.fn((_port: number, callback: () => unknown) => {
    callback();
    return { close: vi.fn() };
  });
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  const logger = buildMockLogger(auth, workspace);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  const mockAudioPlayer = getMockAudioPlayer();
  mockAudioPlayerInit.mockResolvedValueOnce(mockAudioPlayer);

  const server = await start({
    auth,
    baseLogger: logger,
    port: 0,
    workspace,
  });

  expect(buildAppMock.mock.lastCall?.[0]).toEqual({
    audioPlayer: mockAudioPlayer,
    auth: expect.anything(),
    barcodeClient: expect.anything(),
    logger: expect.anything(),
    workspace,
    usbDrive: expect.anything(),
    printer: expect.anything(),
  });
  expect(listen).toHaveBeenNthCalledWith(1, 0, expect.any(Function));

  expectToHaveBeenCalledWith(mockAudioPlayerInit, {
    logger: expect.anything(),
  });

  server.close();
});
