import { PrinterConfig } from '@votingworks/types';
import { rootDebug } from '../utils/debug';
import { exec } from '../utils/exec';
import { getPpdPath } from './supported';

const debug = rootDebug.extend('configure');

export const DEFAULT_MANAGED_PRINTER_NAME = 'VxPrinter';

/**
 * Configures a printer at a given device URI with a name and PPD.
 */
export async function configurePrinter({
  uri,
  config,
}: {
  uri: string;
  config: PrinterConfig;
}): Promise<void> {
  const lpadminConfigureArgs = [
    '-p',
    DEFAULT_MANAGED_PRINTER_NAME,
    '-v',
    uri,
    '-P',
    getPpdPath(config),
    '-E',
    // Abort failed jobs so they don't get retried 5 minutes later, possibly resulting
    // in unexpectedly printing a ballot
    '-o',
    'printer-error-policy=abort-job',
  ];

  debug('configuring printer with lpadmin: args=%o', lpadminConfigureArgs);
  (await exec('lpadmin', lpadminConfigureArgs)).unsafeUnwrap();
}
