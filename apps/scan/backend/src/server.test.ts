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
import { dirSync } from 'tmp';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import { testDetectDevices } from '@votingworks/backend';
import { buildApp } from './app';
import { NODE_ENV, PORT } from './globals';
import { start } from './server';
import { createWorkspace, Workspace } from './util/workspace';
import { buildMockLogger } from '../test/helpers/shared_helpers';
import { getAudioInfo } from './audio/info';
import { Player as AudioPlayer } from './audio/player';

vi.mock('./app');
vi.mock('./audio/info');
vi.mock('./audio/player');

const buildAppMock = buildApp as MockedFunction<typeof buildApp>;
const mockGetAudioInfo = vi.mocked(getAudioInfo);
const mockAudioPlayerClass = vi.mocked(AudioPlayer);

let workspace!: Workspace;

beforeEach(() => {
  workspace = createWorkspace(dirSync().name, mockBaseLogger({ fn: vi.fn }));
});

afterEach(() => {
  workspace.reset();
});

test('start passes context to `buildApp`', async () => {
  const listen = vi.fn<(port: number, callback: () => unknown) => void>();
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  const logger = buildMockLogger(auth, workspace);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  mockGetAudioInfo.mockResolvedValueOnce({
    builtin: { headphonesActive: false, name: 'pci.stereo' },
    usb: { name: 'usb.stereo' },
  });

  const mockAudioPlayer = {
    trustMe: 'I play audio.',
  } as unknown as AudioPlayer;
  mockAudioPlayerClass.mockReturnValueOnce(mockAudioPlayer);

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

  expect(mockGetAudioInfo).toHaveBeenCalledWith({
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

  expect(logger.log).toHaveBeenNthCalledWith(
    2,
    LogEventId.ApplicationStartup,
    expect.anything(),
    expect.anything()
  );
  expect(logger.log).toHaveBeenNthCalledWith(
    3,
    LogEventId.WorkspaceConfigurationMessage,
    expect.anything(),
    expect.anything()
  );
});

test('logs device attach/unattach events', async () => {
  const listen = vi.fn();
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  const logger = buildMockLogger(auth, workspace);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  mockGetAudioInfo.mockResolvedValueOnce({
    builtin: { headphonesActive: false, name: 'pci.stereo' },
  });

  await start({
    auth: buildMockInsertedSmartCardAuth(vi.fn),
    workspace,
    logger,
  });

  testDetectDevices(logger, expect);
});
