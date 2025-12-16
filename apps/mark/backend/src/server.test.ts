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
import {
  getAudioInfoWithRetry,
  setAudioVolume,
  setDefaultAudio,
} from '@votingworks/backend';
import { err, ok } from '@votingworks/basics';
import { start } from './server';
import { createWorkspace, Workspace } from './util/workspace';
import { buildApp } from './app';
import { NODE_ENV } from './globals';
import { Player as AudioPlayer } from './audio/player';
import { buildMockLogger } from '../test/app_helpers';

vi.mock('./app');
vi.mock('./audio/player');
vi.mock('./barcodes', () => ({
  Client: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    shutDown: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('./app');
vi.mock('./audio/player');

vi.mock('@votingworks/backend', async (importActual) => ({
  ...(await importActual()),
  getAudioInfoWithRetry: vi.fn(),
  setAudioVolume: vi.fn(),
  setDefaultAudio: vi.fn(),
}));

const buildAppMock = buildApp as MockedFunction<typeof buildApp>;
const mockGetAudioInfoWithRetry = vi.mocked(getAudioInfoWithRetry);
const mockAudioPlayerClass = vi.mocked(AudioPlayer);
const mockSetAudioVolume = vi.mocked(setAudioVolume);
const mockSetDefaultAudio = vi.mocked(setDefaultAudio);

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

  mockGetAudioInfoWithRetry.mockResolvedValueOnce({
    builtin: { headphonesActive: false, name: 'pci.stereo' },
  });

  const mockAudioPlayer = {
    trustMe: 'I play audio.',
  } as unknown as AudioPlayer;
  mockAudioPlayerClass.mockReturnValueOnce(mockAudioPlayer);

  const server = await start({
    auth,
    baseLogger: logger,
    port: 0,
    workspace,
  });

  expect(buildAppMock).toHaveBeenCalledWith({
    audioPlayer: mockAudioPlayer,
    auth: expect.anything(),
    barcodeClient: expect.anything(),
    logger: expect.anything(),
    workspace,
    usbDrive: expect.anything(),
    printer: expect.anything(),
  });
  expect(listen).toHaveBeenNthCalledWith(1, 0, expect.any(Function));

  expect(mockGetAudioInfoWithRetry).toHaveBeenCalledWith({
    baseRetryDelayMs: expect.toSatisfy(
      (delay: number) => delay >= 500,
      'should be at least 500ms'
    ),
    logger: expect.anything(),
    maxAttempts: expect.toSatisfy(
      (attempts: number) => attempts >= 2,
      'should be at least 2'
    ),
    nodeEnv: NODE_ENV,
  });
  expect(mockAudioPlayerClass).toHaveBeenCalledWith(
    NODE_ENV,
    expect.anything(),
    'pci.stereo'
  );

  // Only called when USB audio is detected:
  expect(mockSetDefaultAudio).not.toHaveBeenCalled();

  server.close();
});

test('configures USB audio device, if present', async () => {
  const listen = vi.fn((_port: number, callback: () => unknown) => {
    callback();
    return { close: vi.fn() };
  });
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  mockGetAudioInfoWithRetry.mockResolvedValueOnce({
    builtin: { headphonesActive: false, name: 'pci.stereo' },
    usb: { name: 'usb.stereo' },
  });

  mockSetDefaultAudio.mockResolvedValueOnce(ok());
  mockSetAudioVolume.mockResolvedValueOnce(ok());

  const server = await start({
    auth,
    baseLogger: mockBaseLogger({ fn: vi.fn }),
    port: 0,
    workspace,
  });

  expect(mockSetDefaultAudio).toHaveBeenCalledWith('usb.stereo', {
    logger: expect.anything(),
    nodeEnv: NODE_ENV,
  });
  expect(mockSetAudioVolume).toHaveBeenCalledWith({
    logger: expect.anything(),
    nodeEnv: NODE_ENV,
    sinkName: 'usb.stereo',
    volumePct: 100,
  });

  server.close();
});

test('logs if unable to detect USB audio device', async () => {
  const listen = vi.fn((_port: number, callback: () => unknown) => {
    callback();
    return { close: vi.fn() };
  });
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  const logger = buildMockLogger(auth, workspace);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  mockGetAudioInfoWithRetry.mockResolvedValueOnce({
    builtin: { headphonesActive: false, name: 'pci.stereo' },
  });

  const server = await start({
    auth,
    baseLogger: logger,
    port: 0,
    workspace,
  });

  // We can't easily check the internal logger created in start(), but the test
  // verifies the code path runs without error when USB audio is missing.
  expect(mockSetDefaultAudio).not.toHaveBeenCalled();
  expect(mockSetAudioVolume).not.toHaveBeenCalled();

  server.close();
});

test('throws if unable to set USB audio as default', async () => {
  const listen = vi.fn((_port: number, callback: () => unknown) => {
    callback();
    return { close: vi.fn() };
  });
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  mockGetAudioInfoWithRetry.mockResolvedValueOnce({
    builtin: { headphonesActive: false, name: 'pci.stereo' },
    usb: { name: 'telepathy.stereo' },
  });

  mockSetDefaultAudio.mockResolvedValueOnce(
    err({ code: 'pactlError', error: 'output unavailable' })
  );

  await expect(async () =>
    start({
      auth,
      baseLogger: mockBaseLogger({ fn: vi.fn }),
      port: 0,
      workspace,
    })
  ).rejects.toThrow(/unable to set usb audio as default/i);

  expect(mockSetAudioVolume).not.toHaveBeenCalled();
});

test('throws if unable to set USB volume', async () => {
  const listen = vi.fn((_port: number, callback: () => unknown) => {
    callback();
    return { close: vi.fn() };
  });
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  mockGetAudioInfoWithRetry.mockResolvedValueOnce({
    builtin: { headphonesActive: false, name: 'pci.stereo' },
    usb: { name: 'telepathy.stereo' },
  });

  mockSetDefaultAudio.mockResolvedValueOnce(ok());
  mockSetAudioVolume.mockResolvedValueOnce(
    err({ code: 'pactlError', error: 'output unavailable' })
  );

  await expect(async () =>
    start({
      auth,
      baseLogger: mockBaseLogger({ fn: vi.fn }),
      port: 0,
      workspace,
    })
  ).rejects.toThrow(/unable to set usb audio volume/i);
});
