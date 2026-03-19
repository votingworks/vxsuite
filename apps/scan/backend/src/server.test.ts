import {
  afterEach,
  beforeEach,
  expect,
  MockedFunction,
  test,
  vi,
} from 'vitest';
import { LogEventId, Logger, mockBaseLogger } from '@votingworks/logging';
import { Application } from 'express';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import { testDetectDevices } from '@votingworks/backend';
import { buildApp } from './app.js';
import { NODE_ENV, PORT } from './globals.js';
import { start } from './server.js';
import { createWorkspace, Workspace } from './util/workspace.js';
import { buildMockLogger } from '../test/helpers/shared_helpers.js';
import { Player as AudioPlayer } from './audio/player.js';
import { AudioCard } from './audio/card.js';

vi.mock('./app');
vi.mock('./audio/card');
vi.mock('./audio/player');

vi.mock('@votingworks/backend', async (importActual) => ({
  ...(await importActual()),
  getAudioCardName: vi.fn(),
  getAudioInfoWithRetry: vi.fn(),
  setAudioCardProfile: vi.fn(),
  setAudioVolume: vi.fn(),
  setDefaultAudio: vi.fn(),
}));

const buildAppMock = buildApp as MockedFunction<typeof buildApp>;
const mockAudioPlayerClass = vi.mocked(AudioPlayer);

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

const audioCardName = 'alsa_output.pci';

test('start passes context to `buildApp`', async () => {
  const listen = vi.fn<(port: number, callback: () => unknown) => void>();
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  const logger = buildMockLogger(auth, workspace);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  const mockAudioPlayer = {
    trustMe: 'I play audio.',
  } as unknown as AudioPlayer;
  mockAudioPlayerClass.mockReturnValueOnce(mockAudioPlayer);

  const mockAudioCard = initMockAudioCard(NODE_ENV, logger, audioCardName);
  vi.mocked(mockAudioCard.useHeadphones).mockResolvedValueOnce();
  vi.mocked(mockAudioCard.setVolume).mockResolvedValueOnce();

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

  expect(mockAudioPlayerClass).toHaveBeenCalledWith(
    NODE_ENV,
    logger,
    mockAudioCard
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

  const mockAudioCard = initMockAudioCard(NODE_ENV, logger, audioCardName);
  vi.mocked(mockAudioCard.useHeadphones).mockResolvedValueOnce();
  vi.mocked(mockAudioCard.setVolume).mockResolvedValueOnce();

  await start({
    auth: buildMockInsertedSmartCardAuth(vi.fn),
    workspace,
    logger,
  });

  expect(mockAudioCard.useHeadphones).toHaveBeenCalledOnce();
  expect(mockAudioCard.setVolume).toHaveBeenCalledExactlyOnceWith(100);
});

test('throws if unable to set volume', async () => {
  const listen = vi.fn<(port: number, callback: () => unknown) => void>();
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  const logger = buildMockLogger(auth, workspace);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  const mockAudioCard = initMockAudioCard(NODE_ENV, logger, audioCardName);
  vi.mocked(mockAudioCard.useHeadphones).mockResolvedValueOnce();
  vi.mocked(mockAudioCard.setVolume).mockRejectedValueOnce('invalid device');

  await expect(async () =>
    start({
      auth: buildMockInsertedSmartCardAuth(vi.fn),
      workspace,
      logger,
    })
  ).rejects.toThrow(/invalid device/i);
});

test('logs device attach/unattach events', async () => {
  const listen = vi.fn();
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  const logger = buildMockLogger(auth, workspace);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  const mockAudioCard = initMockAudioCard(NODE_ENV, logger, audioCardName);
  vi.mocked(mockAudioCard.useHeadphones).mockResolvedValueOnce();
  vi.mocked(mockAudioCard.setVolume).mockResolvedValueOnce();

  await start({
    auth: buildMockInsertedSmartCardAuth(vi.fn),
    workspace,
    logger,
  });

  testDetectDevices(logger, expect);
});

function initMockAudioCard(
  nodeEnv: typeof NODE_ENV,
  logger: Logger,
  name: string
) {
  const mockAudioCard = new AudioCard(nodeEnv, logger, { name });

  const mockAudioCardDefault = vi.spyOn(AudioCard, 'default');
  mockAudioCardDefault.mockImplementation((paramNodeEnv, paramLogger) => {
    expect(paramNodeEnv).toEqual(nodeEnv);
    expect(paramLogger).toEqual(logger);

    return Promise.resolve(mockAudioCard);
  });

  return mockAudioCard;
}
