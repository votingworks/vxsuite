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
import { detectMultiUsbDrive, MultiUsbDrive } from '@votingworks/usb-drive';
import {
  HP_LASER_PRINTER_CONFIG,
  Printer,
  detectPrinter,
} from '@votingworks/printing';
import { detectDevices, startCpuMetricsLogging } from '@votingworks/backend';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { resolve } from 'node:path';
import { ADMIN_WORKSPACE, PEER_PORT, PORT } from './globals';
import { createWorkspace, createClientWorkspace } from './util/workspace';
import { buildApp } from './app';
import { buildClientApp } from './client_app';
import { buildPeerApp } from './peer_app';
import { readMachineMode } from './machine_mode';
import { getMachineConfig } from './machine_config';
import { startHostNetworking, startClientNetworking } from './networking';
import { rootDebug } from './util/debug';
import { getUserRole } from './util/auth';
import type { MachineMode } from './types';

const debug = rootDebug.extend('server');

/* istanbul ignore next - ADMIN_WORKSPACE is not set in tests @preserve */
function resolveWorkspacePath(baseLogger: BaseLogger): string {
  const workspacePath = ADMIN_WORKSPACE;
  if (!workspacePath) {
    baseLogger.log(LogEventId.WorkspaceConfigurationMessage, 'system', {
      message:
        'workspace path could not be determined; pass a workspace or run with ADMIN_WORKSPACE',
      disposition: 'failure',
    });
    throw new Error(
      'workspace path could not be determined; pass a workspace or run with ADMIN_WORKSPACE'
    );
  }
  return resolve(workspacePath);
}

function createAuth(
  machineMode: MachineMode,
  baseLogger: BaseLogger
): DippedSmartCardAuth {
  return new DippedSmartCardAuth({
    card:
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
      isIntegrationTest()
        ? new MockFileCard()
        : new JavaCard(),
    config: {
      allowElectionManagersToAccessUnconfiguredMachines: false,
      allowedUserRoles:
        machineMode === 'client'
          ? [
              'vendor',
              'system_administrator',
              'election_manager',
              'poll_worker',
            ]
          : ['vendor', 'system_administrator', 'election_manager'],
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
}

/**
 * Starts the server with all the default options.
 */
export async function start(options: StartOptions = {}): Promise<Server> {
  const {
    logger: baseLogger = new BaseLogger(LogSource.VxAdminService),
    port = PORT,
    peerPort = PEER_PORT,
  } = options;

  debug('starting server...');
  detectDevices({ logger: baseLogger });

  const workspacePath =
    options.workspacePath ?? resolveWorkspacePath(baseLogger);
  const machineMode = readMachineMode(workspacePath);

  let app;

  switch (machineMode) {
    case 'host': {
      // TODO(CARO) add some kind of validation that the workspace is properly configured for host mode
      const workspace = createWorkspace(workspacePath, baseLogger);
      const auth = createAuth('host', baseLogger);
      const logger = Logger.from(
        baseLogger,
        /* istanbul ignore next - @preserve */
        () => getUserRole(auth, workspace.store)
      );
      const multiUsbDrive =
        options.multiUsbDrive ?? detectMultiUsbDrive(logger);
      const printer = options.printer ?? detectPrinter(logger);

      const isMultiStationEnabled = isFeatureFlagEnabled(
        BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
      );

      if (isMultiStationEnabled) {
        const peerApp = buildPeerApp({ workspace, logger: baseLogger });
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
      });

      // Log election results data check at startup
      const electionId = workspace.store.getCurrentElectionId();
      const cvrFileEntries = electionId
        ? workspace.store.getCvrFiles(electionId)
        : [];
      const manualResults = electionId
        ? workspace.store.getManualResults({ electionId })
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
        isFeatureFlagEnabled(
          BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
        ),
        'Multi-station admin must be enabled for client mode'
      );

      // TODO(CARO) add some kind of validation that the workspace is properly configured for client mode
      const clientWorkspace = createClientWorkspace(workspacePath);
      const auth = createAuth('client', baseLogger);
      const logger = Logger.from(
        baseLogger,
        /* istanbul ignore next - @preserve */
        () => getUserRole(auth, clientWorkspace.clientStore)
      );

      const multiUsbDrive =
        options.multiUsbDrive ?? detectMultiUsbDrive(logger);

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
      });

      baseLogger.log(LogEventId.DataCheckOnStartup, 'system', {
        message:
          'No election results data is present in the database at machine startup.',
        numCvrFiles: 0,
        numManualResults: 0,
      });
      break;
    }

    /* istanbul ignore next - @preserve */
    default:
      throwIllegalValue(machineMode);
  }

  useDevDockRouter(app, express, {
    printerConfig: HP_LASER_PRINTER_CONFIG,
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
  return server;
}
