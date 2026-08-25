import {
  afterEach,
  beforeEach,
  expect,
  MockedFunction,
  test,
  vi,
} from 'vitest';
import { LogEventId, Logger, mockBaseLogger } from '@votingworks/logging';
import { EventEmitter } from 'node:events';
import { Application } from 'express';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import {
  getNodeEnv,
  type NODE_ENV,
  testDetectDevices,
} from '@votingworks/backend';
import { mockConstructor } from '@votingworks/test-utils';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { buildApp } from './app.js';
import { PORT } from './globals.js';
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
  vi.unstubAllEnvs();
});

const audioCardName = 'alsa_output.pci';

test('start passes context to `buildApp`', async () => {
  const listen = vi
    .fn<(port: number, callback: () => unknown) => EventEmitter>()
    .mockReturnValue(new EventEmitter());
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  const logger = buildMockLogger(auth, workspace);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  const mockAudioPlayer = {
    trustMe: 'I play audio.',
    setIsScreenReaderEnabled: vi.fn().mockResolvedValue(undefined),
  } as unknown as AudioPlayer;
  mockAudioPlayerClass.mockImplementationOnce(
    mockConstructor(() => mockAudioPlayer)
  );

  const mockAudioCard = initMockAudioCard(getNodeEnv(), logger, audioCardName);

  await start({
    auth: buildMockInsertedSmartCardAuth(vi.fn),
    workspace,
    logger,
  });

  expect(buildAppMock.mock.lastCall?.[0]).toEqual({
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
    getNodeEnv(),
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

test.each([
  {
    systemSettings: undefined,
    isScreenReaderEnabled: false,
  },
  {
    systemSettings: DEFAULT_SYSTEM_SETTINGS,
    isScreenReaderEnabled: true,
  },
  {
    systemSettings: {
      ...DEFAULT_SYSTEM_SETTINGS,
      precinctScanDisableScreenReaderAudio: true,
    },
    isScreenReaderEnabled: false,
  },
])(
  'configures audio player correctly',
  async ({ systemSettings, isScreenReaderEnabled }) => {
    const listen = vi
      .fn<(port: number, callback: () => unknown) => EventEmitter>()
      .mockReturnValue(new EventEmitter());
    const auth = buildMockInsertedSmartCardAuth(vi.fn);
    const logger = buildMockLogger(auth, workspace);
    buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

    if (systemSettings) {
      workspace.store.setSystemSettings(systemSettings);
    }

    initMockAudioCard(getNodeEnv(), logger, audioCardName);

    await start({
      auth: buildMockInsertedSmartCardAuth(vi.fn),
      workspace,
      logger,
    });

    const mockAudioPlayer = mockAudioPlayerClass.mock.results[0].value;
    expect(
      mockAudioPlayer.setIsScreenReaderEnabled
    ).toHaveBeenCalledExactlyOnceWith(isScreenReaderEnabled);
  }
);

test('logs device attach/unattach events', async () => {
  const listen = vi.fn().mockReturnValue(new EventEmitter());
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  const logger = buildMockLogger(auth, workspace);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  initMockAudioCard(getNodeEnv(), logger, audioCardName);

  await start({
    auth: buildMockInsertedSmartCardAuth(vi.fn),
    workspace,
    logger,
  });

  testDetectDevices(logger, expect);
});

function initMockAudioCard(nodeEnv: NODE_ENV, logger: Logger, name: string) {
  const mockAudioCard = new AudioCard(nodeEnv, logger, { name });

  const mockAudioCardDefault = vi.spyOn(AudioCard, 'default');
  mockAudioCardDefault.mockImplementation((paramNodeEnv, paramLogger) => {
    expect(paramNodeEnv).toEqual(nodeEnv);
    expect(paramLogger).toEqual(logger);

    return Promise.resolve(mockAudioCard);
  });

  return mockAudioCard;
}
