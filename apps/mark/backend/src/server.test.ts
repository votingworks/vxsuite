import {
  afterEach,
  beforeEach,
  expect,
  MockedFunction,
  test,
  vi,
} from 'vitest';
import { mockBaseLogger } from '@votingworks/logging';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import { Application } from 'express';
import { analogAndHdmi, getNodeEnv } from '@votingworks/backend';
import { start } from './server.js';
import { createWorkspace, Workspace } from './util/workspace.js';
import { buildApp } from './app.js';
import { AudioCard, Player as AudioPlayer } from './audio/player.js';
import { buildMockLogger } from '../test/app_helpers.js';

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

const buildAppMock = buildApp as MockedFunction<typeof buildApp>;

const mockAudioCardInit = vi.spyOn(analogAndHdmi, 'defaultAudioCard');
const mockAudioPlayerInit = vi.spyOn(analogAndHdmi, 'defaultAudioPlayer');

let workspace!: Workspace;

beforeEach(() => {
  workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );
});

afterEach(() => {
  workspace.reset();
});

test('start passes context to `buildApp`', async () => {
  const listen = vi.fn((_port: number, callback: () => unknown) => {
    callback();
    return { close: vi.fn() };
  });
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  const logger = buildMockLogger(auth, workspace);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  const mockAudioCard = { mock: 'audio card' } as unknown as AudioCard;
  mockAudioCardInit.mockResolvedValueOnce(mockAudioCard);

  const mockAudioPlayer = {
    trustMe: 'I play audio.',
  } as unknown as AudioPlayer;
  mockAudioPlayerInit.mockReturnValueOnce(mockAudioPlayer);

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

  expect(mockAudioPlayerInit).toHaveBeenCalledWith<[analogAndHdmi.PlayerInit]>({
    card: mockAudioCard,
    nodeEnv: getNodeEnv(),
    logger: expect.anything(),
    soundsDirectory: expect.any(String), // Tested in player.test
  });

  server.close();
});

test('throws if unable to initialize audio card', async () => {
  const listen = vi.fn((_port: number, callback: () => unknown) => {
    callback();
    return { close: vi.fn() };
  });
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  mockAudioCardInit.mockImplementationOnce(() =>
    Promise.reject(new Error('no card found'))
  );

  await expect(async () =>
    start({
      auth,
      baseLogger: mockBaseLogger({ fn: vi.fn }),
      port: 0,
      workspace,
    })
  ).rejects.toThrow(/no card found/i);
});
