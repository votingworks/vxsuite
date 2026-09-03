import express from 'express';
import {
  LogEventId,
  BaseLogger,
  LogSource,
  Logger,
} from '@votingworks/logging';
import {
  DippedSmartCardAuth,
  JavaCard,
  manageOpensslConfig,
  MockFileCard,
} from '@votingworks/auth';
import { Server } from 'node:http';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';
import {
  detectMultiUsbDriveFromEnv,
  MultiUsbDrive,
} from '@votingworks/usb-drive';
import {
  HP_4001_PRINTER_CONFIG,
  Printer,
  detectPrinter,
} from '@votingworks/printing';
import { detectDevices, startCpuMetricsLogging } from '@votingworks/backend';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import { UserRole } from '@votingworks/types';
import { PEER_PORT, PORT } from './globals.js';
import {
  createWorkspace,
  createClientWorkspace,
  emptyWorkspaceData,
  hasInterruptedRestore,
  resolveWorkspacePath,
} from './util/workspace.js';
import { buildApp } from './app.js';
import { buildClientApp } from './client_app.js';
import { buildPeerApp } from './peer_app.js';
import { buildRestoreApp, RESTORE_MODE_STORE } from './restore_app.js';
import { getMachineConfig } from './machine_config.js';
import { isMultiStationAdjudicationEnabled } from './multi_station_config.js';
import { startHostNetworking, startClientNetworking } from './networking.js';
import { rootDebug } from './util/debug.js';
import { getUserRole } from './util/auth.js';
import type { AppMode } from './types.js';
import {
  FileBackedMachineModeController,
  MachineModeController,
} from './machine_mode.js';
import {
  BootIntentController,
  FileBackedBootIntentController,
} from './boot_intent.js';

const debug = rootDebug.extend('server');

function allowedUserRoles(appMode: AppMode): UserRole[] {
  switch (appMode) {
    case 'host': {
      return ['vendor', 'system_administrator', 'election_manager'];
    }

    case 'client': {
      return [
        'vendor',
        'system_administrator',
        'election_manager',
        'poll_worker',
      ];
    }

    // Restore mode has no election to manage; what it has is a workspace to
    // replace, which is a system administrator's business.
    case 'restore': {
      return ['vendor', 'system_administrator'];
    }

    default: {
      throwIllegalValue(appMode);
    }
  }
}

function createAuth(
  appMode: AppMode,
  baseLogger: BaseLogger
): DippedSmartCardAuth {
  return new DippedSmartCardAuth({
    card:
      // @coverage-defer
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
      isIntegrationTest()
        ? new MockFileCard()
        : new JavaCard(),
    config: {
      allowElectionManagersToAccessUnconfiguredMachines: false,
      allowedUserRoles: allowedUserRoles(appMode),
    },
    logger: baseLogger,
  });
}

/**
 * Options for starting the admin service. All fields are optional — production
 * defaults are used when omitted. Tests can inject pre-built dependencies.
 */
export interface StartOptions {
  logger?: BaseLogger;
  port?: number | string;
  peerPort?: number;
  workspacePath?: string;
  multiUsbDrive?: MultiUsbDrive;
  printer?: Printer;
  machineMode?: MachineModeController;
  bootIntent?: BootIntentController;
}

/**
 * Starts the server with all the default options.
 */
// @coverage-defer
export async function start(options: StartOptions = {}): Promise<Server> {
  const {
    logger: baseLogger = new BaseLogger(LogSource.VxAdminService),
    port = PORT,
    peerPort = PEER_PORT,
  } = options;

  debug('starting server...');
  const stopDetectingDevices = detectDevices({ logger: baseLogger });

  const workspacePath =
    options.workspacePath ?? resolveWorkspacePath(baseLogger);

  // Taken first, and spent by the taking: whatever this boot goes on to do,
  // the next one is an ordinary boot.
  const bootIntent =
    options.bootIntent ??
    FileBackedBootIntentController.forWorkspace(workspacePath);
  const machineMode =
    options.machineMode ??
    FileBackedMachineModeController.forWorkspace(workspacePath);
  const intent = bootIntent.take();
  const isRestoreEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.ENABLE_ADMIN_BACKUP_RESTORE
  );
  if (intent === 'restore' && !isRestoreEnabled) {
    baseLogger.log(LogEventId.WorkspaceConfigurationMessage, 'system', {
      message:
        'Restore mode was asked for on the last boot, but backup and restore ' +
        'are not enabled; starting normally.',
      disposition: 'failure',
    });
  }
  const appMode: AppMode =
    intent === 'restore' && isRestoreEnabled ? 'restore' : machineMode.get();

  if (hasInterruptedRestore(workspacePath)) {
    await emptyWorkspaceData(workspacePath);
    baseLogger.log(LogEventId.BackupRestoreInterrupted, 'system', {
      message:
        `A restore of ${workspacePath} was interrupted before it finished; ` +
        `discarded what it left behind and starting unconfigured.`,
    });
  }

  let app;

  switch (appMode) {
    case 'host': {
      // TODO(CARO) add some kind of validation that the workspace is properly configured for host mode
      const workspace = createWorkspace(workspacePath, baseLogger);
      const auth = createAuth('host', baseLogger);
      const logger = Logger.from(
        baseLogger,
        // @coverage-exclude
        () => getUserRole(auth, workspace.store)
      );
      const multiUsbDrive =
        options.multiUsbDrive ?? detectMultiUsbDriveFromEnv({ logger });
      const printer = options.printer ?? detectPrinter(logger);

      // Release any stale ballot claims from this host machine left over
      // from a previous process (e.g. crash or restart).
      const currentElectionId = workspace.store.getCurrentElectionId();
      if (currentElectionId) {
        workspace.store.releaseAllClaimsForMachine({
          electionId: currentElectionId,
          machineId: getMachineConfig().machineId,
        });
      }

      const isMultiStationEnabled = isMultiStationAdjudicationEnabled();

      if (isMultiStationEnabled) {
        const peerApp = buildPeerApp({
          workspace,
          logger: baseLogger,
          machineId: getMachineConfig().machineId,
        });
        peerApp.listen(peerPort, () => {
          debug('Peer API server running at http://localhost:%d/', peerPort);
          baseLogger.log(LogEventId.ApplicationStartup, 'system', {
            message: `Peer API server running at http://localhost:${peerPort}/`,
            disposition: 'success',
          });
        });

        startHostNetworking({
          machineId: getMachineConfig().machineId,
          peerPort,
          store: workspace.store,
          logger: baseLogger,
        });
      }

      app = buildApp({
        auth,
        logger,
        multiUsbDrive,
        printer,
        workspace,
        machineMode,
        bootIntent,
      });

      // Log election results data check at startup
      const electionId = workspace.store.getCurrentElectionId();
      const electionRecord = electionId
        ? assertDefined(workspace.store.getElection(electionId))
        : undefined;
      const cvrFileEntries = electionId
        ? workspace.store.getCvrFiles(electionId)
        : [];
      const manualResults = electionId
        ? workspace.store.getManualResults({
            election: assertDefined(electionRecord).electionDefinition.election,
            electionId,
          })
        : [];

      const message =
        cvrFileEntries.length > 0 || manualResults.length > 0
          ? 'Election results data is present in the database at machine startup.'
          : 'No election results data is present in the database at machine startup.';
      baseLogger.log(LogEventId.DataCheckOnStartup, 'system', {
        message,
        numCvrFiles: cvrFileEntries.length,
        numManualResults: manualResults.length,
      });
      break;
    }

    case 'client': {
      assert(
        isMultiStationAdjudicationEnabled(),
        'Multi-station admin must be enabled for client mode'
      );

      // TODO(CARO) add some kind of validation that the workspace is properly configured for client mode
      const clientWorkspace = createClientWorkspace(workspacePath);
      const auth = createAuth('client', baseLogger);
      const logger = Logger.from(
        baseLogger,
        // @coverage-exclude
        () => getUserRole(auth, clientWorkspace.clientStore)
      );

      const multiUsbDrive =
        options.multiUsbDrive ?? detectMultiUsbDriveFromEnv({ logger });

      startClientNetworking({
        machineId: getMachineConfig().machineId,
        clientStore: clientWorkspace.clientStore,
        auth,
        logger: baseLogger,
      });

      app = buildClientApp({
        auth,
        logger,
        workspace: clientWorkspace,
        multiUsbDrive,
        machineMode,
      });

      baseLogger.log(LogEventId.DataCheckOnStartup, 'system', {
        message:
          'No election results data is present in the database at machine startup.',
        numCvrFiles: 0,
        numManualResults: 0,
      });
      break;
    }

    case 'restore': {
      const auth = createAuth('restore', baseLogger);
      const logger = Logger.from(
        baseLogger,
        // @coverage-exclude
        () => getUserRole(auth, RESTORE_MODE_STORE)
      );
      const multiUsbDrive =
        options.multiUsbDrive ?? detectMultiUsbDriveFromEnv({ logger });

      app = buildRestoreApp({
        auth,
        logger,
        multiUsbDrive,
        workspacePath,
        machineMode,
      });

      baseLogger.log(LogEventId.AdminRestoreModeEntered, 'system', {
        message:
          `Starting in restore mode, as asked on the last boot. ` +
          `${workspacePath} is not being served; a backup may be restored into it.`,
      });
      break;
    }

    default:
      throwIllegalValue(appMode);
  }

  useDevDockRouter(app, express, {
    printerConfig: HP_4001_PRINTER_CONFIG,
  });

  startCpuMetricsLogging(baseLogger);

  // VxAdmin uses an OpenSSL config file swapping mechanism for card cert creation with the TPM.
  // This is a fallback call to restore the default config in case the app crashed before the
  // restore could complete.
  await manageOpensslConfig('restore-default', { addSudo: true });

  const server = app.listen(port, () => {
    baseLogger.log(LogEventId.ApplicationStartup, 'system', {
      message: `Admin Service running at http://localhost:${port}/`,
      disposition: 'success',
    });
  });

  // Explicitly disable Node.js's idle socket timeout (its default) so long-
  // running requests are never reset mid-flight: the `waitForUsbDriveChange`
  // long-poll holds a connection open, and slow operations (e.g. large report
  // generation) leave the socket idle while computing. The long-poll bounds
  // its own wait at the application layer
  // (USB_DRIVE_CHANGE_LONG_POLL_TIMEOUT_MS); no socket-level timeout is needed.
  server.timeout = 0;

  server.on('close', stopDetectingDevices);
  return server;
}
