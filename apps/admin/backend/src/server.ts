import express, { Application } from 'express';
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
import { detectUsbDrive, UsbDrive } from '@votingworks/usb-drive';
import {
  HP_LASER_PRINTER_CONFIG,
  Printer,
  detectPrinter,
} from '@votingworks/printing';
import { detectDevices, startCpuMetricsLogging } from '@votingworks/backend';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import { assert } from 'node:console';
import { ADMIN_WORKSPACE, PEER_PORT, PORT } from './globals';
import { createWorkspace, Workspace } from './util/workspace';
import { buildApp } from './app';
import { buildClientApp } from './client_app';
import { buildPeerApp } from './peer_app';
import { readMachineMode } from './machine_mode';
import { getMachineConfig } from './machine_config';
import { startHostNetworking, startClientNetworking } from './networking';
import { rootDebug } from './util/debug';
import { getUserRole } from './util/auth';

const debug = rootDebug.extend('server');

/**
 * Options for starting the admin service.
 */
export interface StartOptions {
  app: Application;
  logger: BaseLogger;
  port: number | string;
  workspace: Workspace;
  usbDrive?: UsbDrive;
  printer?: Printer;
}

/**
 * Starts the server with all the default options.
 */
export async function start({
  app,
  logger: baseLogger = new BaseLogger(LogSource.VxAdminService),
  port = PORT,
  workspace,
  usbDrive,
  printer,
}: Partial<StartOptions>): Promise<Server> {
  debug('starting server...');
  detectDevices({ logger: baseLogger });
  let resolvedWorkspace = workspace;
  /* istanbul ignore next - @preserve */
  if (!resolvedWorkspace) {
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
    resolvedWorkspace = createWorkspace(workspacePath, baseLogger);
  }

  const machineMode = readMachineMode(resolvedWorkspace.path);
  const isMultiStationEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
  );

  let resolvedApp = app;

  /* istanbul ignore next - @preserve */
  if (!resolvedApp) {
    const auth = new DippedSmartCardAuth({
      card:
        isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
        isIntegrationTest()
          ? new MockFileCard()
          : new JavaCard(),
      config: {
        allowElectionManagersToAccessUnconfiguredMachines: false,
        allowedUserRoles:
          machineMode === 'client'
            ? ['vendor', 'system_administrator']
            : ['vendor', 'system_administrator', 'election_manager'],
      },
      logger: baseLogger,
    });

    const logger = Logger.from(baseLogger, () =>
      getUserRole(auth, resolvedWorkspace)
    );

    if (machineMode === 'client') {
      assert(
        isMultiStationEnabled,
        'Multi-station admin must be enabled for client mode'
      );
      const getNetworkConnectionStatus = startClientNetworking({
        machineId: getMachineConfig().machineId,
      });

      resolvedApp = buildClientApp({
        auth,
        logger,
        workspace: resolvedWorkspace,
        getNetworkConnectionStatus,
      });
    } else {
      const resolvedUsbDrive = usbDrive ?? detectUsbDrive(logger);
      const resolvedPrinter = printer ?? detectPrinter(logger);

      resolvedApp = buildApp({
        auth,
        logger,
        usbDrive: resolvedUsbDrive,
        printer: resolvedPrinter,
        workspace: resolvedWorkspace,
      });

      if (isMultiStationEnabled) {
        // Start peer server for host-client communication
        const peerApp = buildPeerApp({
          workspace: resolvedWorkspace,
        });
        peerApp.listen(PEER_PORT, () => {
          debug('Peer API server running at http://localhost:%d/', PEER_PORT);
          baseLogger.log(LogEventId.ApplicationStartup, 'system', {
            message: `Peer API server running at http://localhost:${PEER_PORT}/`,
            disposition: 'success',
          });
        });

        startHostNetworking({
          machineId: getMachineConfig().machineId,
          peerPort: PEER_PORT,
        });
      }
    }
  }

  if (machineMode === 'host') {
    const electionId = resolvedWorkspace.store.getCurrentElectionId();
    const cvrFileEntries = electionId
      ? resolvedWorkspace.store.getCvrFiles(electionId)
      : [];
    const manualResults = electionId
      ? resolvedWorkspace.store.getManualResults({
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
  } /* machine mode is client */ else {
    baseLogger.log(LogEventId.DataCheckOnStartup, 'system', {
      message:
        'No election results data is present in the database at machine startup.',
      numCvrFiles: 0,
      numManualResults: 0,
    });
  }

  useDevDockRouter(resolvedApp, express, {
    printerConfig: HP_LASER_PRINTER_CONFIG,
  });

  // Start periodic CPU metrics logging
  startCpuMetricsLogging(baseLogger);

  // VxAdmin uses an OpenSSL config file swapping mechanism for card cert creation with the TPM.
  // This is a fallback call to restore the default config in case the app crashed before the
  // restore could complete.
  await manageOpensslConfig('restore-default', { addSudo: true });

  const server = resolvedApp.listen(port, () => {
    baseLogger.log(LogEventId.ApplicationStartup, 'system', {
      message: `Admin Service running at http://localhost:${port}/`,
      disposition: 'success',
    });
  });
  return server;
}
