import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import express from 'express';
import { CITIZEN_THERMAL_PRINTER_CONFIG } from '@votingworks/printing';
import { BaseLogger, Logger, LogSource } from '@votingworks/logging';
import { buildLocalApp } from './app';
import { LOCAL_PORT } from './globals';
import { LocalAppContext } from './types';
import { getUserRole } from './auth';

/**
 * Starts the server.
 */
export function start(context: LocalAppContext): void {
  const baseLogger = new BaseLogger(LogSource.VxPollbookBackend);
  const logger = Logger.from(baseLogger, () =>
    getUserRole(context.auth, context.workspace)
  );

  const app = buildLocalApp({ context, logger });

  useDevDockRouter(app, express, {
    printerConfig: CITIZEN_THERMAL_PRINTER_CONFIG,
  });

  app.listen(LOCAL_PORT, () => {
    // eslint-disable-next-line no-console
    console.log(
      `VxPollbook backend running at http://localhost:${LOCAL_PORT}/`
    );
  });
}
