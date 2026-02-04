import {
  afterEach,
  beforeEach,
  expect,
  MockedFunction,
  test,
  vi,
} from 'vitest';
import { LogEventId, mockBaseLogger } from '@votingworks/logging';
import { Application } from 'express';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import {
  getAudioInfoWithRetry,
  setAudioVolume,
  testDetectDevices,
} from '@votingworks/backend';
import { err, ok } from '@votingworks/basics';
import { buildApp } from './app';
import { NODE_ENV, PORT } from './globals';
import { start } from './server';
import { createWorkspace, Workspace } from './util/workspace';
import { buildMockLogger } from '../test/helpers/shared_helpers';
import { Player as AudioPlayer } from './audio/player';

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
  const listen = vi.fn<(port: number, callback: () => unknown) => void>();
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

  mockSetAudioVolume.mockResolvedValueOnce(ok());

  await start({
    auth: buildMockInsertedSmartCardAuth(vi.fn),
    workspace,
    logger,
  });

  expect(buildAppMock).toHaveBeenCalledWith({
    audioPlayer: mockAudioPlayer,
    auth: expect.anything(),
    machine: expect.anything(),
    workspace,
    usbDrive: expect.anything(),
    printer: expect.anything(),
    logger,
  });
  expect(listen).toHaveBeenNthCalledWith(1, PORT, expect.any(Function));

  expect(mockGetAudioInfoWithRetry).toHaveBeenCalledWith({
    baseRetryDelayMs: expect.toSatisfy(
      (delay: number) => delay >= 500,
      'should be at least 500ms'
    ),
    logger,
    maxAttempts: expect.toSatisfy(
      (attempts: number) => attempts >= 2,
      'should be at least 2'
    ),
    nodeEnv: NODE_ENV,
  });
  expect(mockAudioPlayerClass).toHaveBeenCalledWith(
    NODE_ENV,
    logger,
    'pci.stereo'
  );

  const callback = listen.mock.calls[0][1];
  await callback();

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ApplicationStartup,
    expect.anything(),
    expect.anything()
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.WorkspaceConfigurationMessage,
    expect.anything(),
    expect.anything()
  );
});

test('configures audio device', async () => {
  const listen = vi.fn<(port: number, callback: () => unknown) => void>();
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  const logger = buildMockLogger(auth, workspace);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  mockGetAudioInfoWithRetry.mockResolvedValueOnce({
    builtin: { headphonesActive: false, name: 'pci.stereo' },
    usb: { name: 'usb.stereo' },
  });

  mockSetAudioVolume.mockResolvedValueOnce(ok());

  await start({
    auth: buildMockInsertedSmartCardAuth(vi.fn),
    workspace,
    logger,
  });

  expect(mockSetAudioVolume).toHaveBeenCalledWith({
    logger,
    nodeEnv: NODE_ENV,
    sinkName: 'pci.stereo',
    volumePct: 100,
  });
});

test('throws if unable to set volume', async () => {
  const listen = vi.fn<(port: number, callback: () => unknown) => void>();
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  const logger = buildMockLogger(auth, workspace);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  mockGetAudioInfoWithRetry.mockResolvedValueOnce({
    builtin: { headphonesActive: false, name: 'pci.stereo' },
    usb: { name: 'telepathy.stereo' },
  });

  mockSetAudioVolume.mockResolvedValueOnce(
    err({ code: 'pactlError', error: 'output unavailable' })
  );

  await expect(async () =>
    start({
      auth: buildMockInsertedSmartCardAuth(vi.fn),
      workspace,
      logger,
    })
  ).rejects.toThrow(/unable to set builtin audio volume/i);
});

test('logs device attach/unattach events', async () => {
  const listen = vi.fn();
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  const logger = buildMockLogger(auth, workspace);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  mockGetAudioInfoWithRetry.mockResolvedValueOnce({
    builtin: { headphonesActive: false, name: 'pci.stereo' },
  });

  mockSetAudioVolume.mockResolvedValueOnce(ok());

  await start({
    auth: buildMockInsertedSmartCardAuth(vi.fn),
    workspace,
    logger,
  });

  testDetectDevices(logger, expect);
});
