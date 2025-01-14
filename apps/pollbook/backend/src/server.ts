import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import express from 'express';
import { CITIZEN_THERMAL_PRINTER_CONFIG } from '@votingworks/printing';
import { AppContext, buildApp } from './app';
import { PORT } from './globals';

/**
 * Starts the server.
 */
export function start(context: AppContext): void {
  const app = buildApp(context);

  useDevDockRouter(app, express, {
    printerConfig: CITIZEN_THERMAL_PRINTER_CONFIG,
  });

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`VxPollbook backend running at http://localhost:${PORT}/`);
  });
}
