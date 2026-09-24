import {
  afterEach,
  beforeEach,
  expect,
  type Mocked,
  type MockedFunction,
  test,
  vi,
} from 'vitest';
import { LogEventId, type Logger, mockBaseLogger } from '@votingworks/logging';
import { EventEmitter } from 'node:events';
import type { Application } from 'express';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import {
  analogAndHdmi,
  getNodeEnv,
  type NODE_ENV,
  testDetectDevices,
} from '@votingworks/backend';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { MockFileFujitsuPrinter } from '@votingworks/fujitsu-thermal-printer';
import { buildApp } from './app.js';
import { PORT } from './globals.js';
import { start } from './server.js';
import { createWorkspace, type Workspace } from './util/workspace.js';
import { buildMockLogger } from '../test/helpers/shared_helpers.js';
import type { AudioPlayer } from './audio/audio.js';

vi.mock('./app');

const buildAppMock = buildApp as MockedFunction<typeof buildApp>;
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

  const mockAudioPlayer = initMockAudioPlayer();
  const mockAudioCard = initMockAudioCard(getNodeEnv(), logger, audioCardName);

  await start({
    auth: buildMockInsertedSmartCardAuth(vi.fn),
    workspace,
    logger,
    printer: new MockFileFujitsuPrinter(logger),
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

  expect(mockAudioPlayerInit).toHaveBeenCalledWith<[analogAndHdmi.PlayerInit]>({
    nodeEnv: getNodeEnv(),
    logger,
    card: mockAudioCard,
    soundsDirectory: expect.any(String),
  });

  const callback = listen.mock.calls[0]![1];
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

    const mockAudioCard = initMockAudioCard(
      getNodeEnv(),
      logger,
      audioCardName
    );

    const mockPlayer = initMockAudioPlayer();
    const mockSetScreenReaderEnabled = vi.spyOn(
      mockPlayer,
      'setIsScreenReaderEnabled'
    );

    await start({
      auth: buildMockInsertedSmartCardAuth(vi.fn),
      workspace,
      logger,
      printer: new MockFileFujitsuPrinter(logger),
    });

    expect(mockAudioPlayerInit).toHaveBeenCalledWith<
      [analogAndHdmi.PlayerInit]
    >({
      nodeEnv: getNodeEnv(),
      logger,
      card: mockAudioCard,
      soundsDirectory: expect.any(String),
    });

    expect(mockSetScreenReaderEnabled).toHaveBeenCalledExactlyOnceWith(
      isScreenReaderEnabled
    );
  }
);

test('logs device attach/unattach events', async () => {
  const listen = vi.fn().mockReturnValue(new EventEmitter());
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  const logger = buildMockLogger(auth, workspace);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  await start({
    audioPlayer: analogAndHdmi.getMockPlayer(),
    auth: buildMockInsertedSmartCardAuth(vi.fn),
    workspace,
    logger,
    printer: new MockFileFujitsuPrinter(logger),
  });

  testDetectDevices(logger, expect);
});

function initMockAudioCard(nodeEnv: NODE_ENV, logger: Logger, name: string) {
  const mockAudioCard = {
    mockCard: name,
  } as unknown as Mocked<analogAndHdmi.AudioCard>;

  const mockAudioCardDefault = vi.spyOn(analogAndHdmi, 'defaultAudioCard');
  mockAudioCardDefault.mockImplementation((paramNodeEnv, paramLogger) => {
    expect(paramNodeEnv).toEqual(nodeEnv);
    expect(paramLogger).toEqual(logger);

    return Promise.resolve(mockAudioCard);
  });

  return mockAudioCard;
}

function initMockAudioPlayer() {
  const mockPlayer = analogAndHdmi.getMockPlayer() as AudioPlayer;
  mockAudioPlayerInit.mockReturnValueOnce(mockPlayer);

  return mockPlayer;
}
