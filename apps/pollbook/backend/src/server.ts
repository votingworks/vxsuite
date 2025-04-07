import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import express from 'express';
import { CITIZEN_THERMAL_PRINTER_CONFIG } from '@votingworks/printing';
import { buildLocalApp } from './app';
import { LOCAL_PORT } from './globals';
import { LocalAppContext } from './types';

/**
 * Starts the server.
 */
export function start(context: LocalAppContext): void {
  const app = buildLocalApp(context);

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
