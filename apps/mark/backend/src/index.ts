import { fileURLToPath } from 'node:url';
import {
  BaseLogger,
  LogSource,
  LogEventId,
  Logger,
} from '@votingworks/logging';
import {
  audio,
  handleUncaughtExceptions,
  loadEnvVarsFromDotenvFiles,
  TaskController,
} from '@votingworks/backend';
import { detectUsbDrive } from '@votingworks/usb-drive';
import { detectPrinter } from '@votingworks/printing';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import * as server from './server.js';
import { MARK_WORKSPACE, NODE_ENV, PORT } from './globals.js';
import { createWorkspace, Workspace } from './util/workspace.js';
import { startElectricalTestingServer } from './electrical_testing/server.js';
import { getDefaultAuth, getUserRole } from './util/auth.js';
import { BarcodeClient } from './barcodes/index.js';
import { MockBarcodeClient } from './barcodes/mock_client.js';
import { Player as AudioPlayer } from './audio/player.js';

export type { Api } from './app.js';
export type { PrintCalibration } from '@votingworks/hmpb';
export type {
  ElectricalTestingApi,
  BarcodeStatus,
} from './electrical_testing/app.js';
export * from './types.js';

loadEnvVarsFromDotenvFiles();

const baseLogger = new BaseLogger(LogSource.VxMarkBackend);

function resolveWorkspace(): Workspace {
  const workspacePath = MARK_WORKSPACE;
  if (!workspacePath) {
    baseLogger.log(LogEventId.WorkspaceConfigurationMessage, 'system', {
      message:
        'workspace path could not be determined; pass a workspace or run with MARK_WORKSPACE',
      disposition: 'failure',
    });
    throw new Error(
      'workspace path could not be determined; pass a workspace or run with MARK_WORKSPACE'
    );
  }
  return createWorkspace(workspacePath, baseLogger);
}

async function main(): Promise<number> {
  handleUncaughtExceptions(baseLogger);

  const workspace = resolveWorkspace();

  if (
    isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.ENABLE_HARDWARE_TEST_APP
    )
  ) {
    const auth = getDefaultAuth(baseLogger);
    const logger = Logger.from(baseLogger, () => getUserRole(auth, workspace));
    const usbDrive = detectUsbDrive(logger);
    const printer = detectPrinter(logger);
    const useMockBarcode = isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.USE_MOCK_BARCODE_READER
    );
    const barcodeClient = useMockBarcode
      ? new MockBarcodeClient()
      : new BarcodeClient(baseLogger);

    // Initialize audio for electrical testing
    let audioPlayer: AudioPlayer | undefined;
    try {
      const detectedAudioInfo = await audio.getAudioInfo({
        logger,
        nodeEnv: NODE_ENV,
      });
      if (detectedAudioInfo.builtin) {
        audioPlayer = new AudioPlayer(
          NODE_ENV,
          logger,
          detectedAudioInfo.builtin.name
        );
      }
    } catch (error) {
      logger.log(LogEventId.Info, 'system', {
        message: `Failed to initialize audio: ${error}`,
        disposition: 'failure',
      });
    }

    startElectricalTestingServer({
      audioPlayer,
      auth,
      cardTask: TaskController.started(),
      usbDriveTask: TaskController.started(),
      printerTask: TaskController.started(),
      usbDrive,
      logger,
      workspace,
      printer,
      barcodeClient,
    });
    return 0;
  }

  await server.start({ port: PORT, baseLogger, workspace });
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      void baseLogger.log(LogEventId.ApplicationStartup, 'system', {
        message: `Error in starting VxMark backend: ${(error as Error).stack}`,
        disposition: 'failure',
      });
      process.exitCode = 1;
    });
}
