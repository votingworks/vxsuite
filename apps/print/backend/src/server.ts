import express from 'express';
import { BaseLogger, Logger } from '@votingworks/logging';
import {
  DippedSmartCardAuth,
  DippedSmartCardAuthApi,
  JavaCard,
  MockFileCard,
} from '@votingworks/auth';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';
import { detectUsbDrive } from '@votingworks/usb-drive';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import { detectPrinter, HP_LASER_PRINTER_CONFIG } from '@votingworks/printing';
import { buildApp } from './app';
import { PORT } from './globals';
import { Workspace } from './util/workspace';
import { getUserRole } from './util/auth';
import { AppContext } from './context';

export interface StartOptions {
  auth?: DippedSmartCardAuthApi;
  baseLogger: BaseLogger;
  workspace: Workspace;
}

/**
 * Starts the server.
 */
export function start({ auth, baseLogger, workspace }: StartOptions): void {
  const resolvedAuth =
    auth ??
    new DippedSmartCardAuth({
      card:
        isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
        isIntegrationTest()
          ? new MockFileCard()
          : new JavaCard(),
      config: {
        allowElectionManagersToAccessUnconfiguredMachines: true,
        allowedUserRoles: [
          'vendor',
          'system_administrator',
          'election_manager',
          'poll_worker',
        ],
      },
      logger: baseLogger,
    });

  const logger = Logger.from(
    baseLogger,
    /* istanbul ignore next - @preserve */ () =>
      getUserRole(resolvedAuth, workspace)
  );
  const usbDrive = detectUsbDrive(logger);
  const printer = detectPrinter(logger);

  const context: AppContext = {
    auth: resolvedAuth,
    logger,
    usbDrive,
    workspace,
    printer,
  };
  const app = buildApp(context);

  useDevDockRouter(app, express, {
    printerConfig: HP_LASER_PRINTER_CONFIG,
  });

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`VxPrint backend running at http://localhost:${PORT}/`);
  });
}
