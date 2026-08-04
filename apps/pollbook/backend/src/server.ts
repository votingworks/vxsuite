import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import express from 'express';
import { CITIZEN_THERMAL_PRINTER_CONFIG } from '@votingworks/printing';
import { BaseLogger, Logger, LogSource } from '@votingworks/logging';
import { startCpuMetricsLogging } from '@votingworks/backend';
import { buildLocalApp } from './app.js';
import { PORT } from './globals.js';
import { LocalAppContext } from './types.js';
import { getUserRole } from './auth.js';
import { BarcodeScannerClient } from './barcode_scanner/client.js';

/**
 * Starts the server.
 */
export function start(context: LocalAppContext): void {
  const baseLogger = new BaseLogger(LogSource.VxPollBookBackend);
  const logger = Logger.from(baseLogger, () =>
    getUserRole(context.auth, context.workspace)
  );

  const barcodeScannerClient = new BarcodeScannerClient(logger);
  void barcodeScannerClient.listen();

  const app = buildLocalApp({
    context,
    logger,
    barcodeScannerClient,
  });

  useDevDockRouter(app, express, {
    printerConfig: CITIZEN_THERMAL_PRINTER_CONFIG,
  });

  startCpuMetricsLogging(baseLogger);

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`VxPollBook backend running at http://localhost:${PORT}/`);
  });
}
