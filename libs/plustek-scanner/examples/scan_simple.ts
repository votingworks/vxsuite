/**
 * This example provides a basic CLI to wait for and scan a single sheet.
 *
 * Run it:
 *
 *   pnpx esr --cache examples/scan_simple.ts
 *
 * With debugging:
 *
 *   DEBUG=* esr --cache examples/scan_simple.ts
 */

import makeDebug from 'debug';
import { createClient, PaperStatus, ScannerClient } from '../src';

const debug = makeDebug('plustek-scanner:example');

main()
  .catch((error) => {
    console.error('CRASH:', error.stack);
    return 1;
  })
  .then((code) => {
    process.exitCode = code;
  });

async function main(): Promise<number> {
  debug('opening');
  const openResult = await createClient();

  debug('open result: %s', openResult.isOk() ? 'ok' : 'not ok');
  if (openResult.isErr()) {
    console.error('failed to open scanner:', openResult.unsafeUnwrapErr());
    return;
  }

  const scanner = openResult.unsafeUnwrap();
  await waitUntilReadyToScan(scanner);
  const scanResult = await scanner.scan();

  if (scanResult.isOk()) {
    for (const file of scanResult.ok().files) {
      process.stdout.write(`${file}\n`);
    }
  } else {
    process.stderr.write(`failed to scan: ${scanResult.unsafeUnwrapErr()}\n`);
  }

  await scanner.close();
  return scanResult.isOk() ? 0 : 1;
}

async function waitUntilReadyToScan(scanner: ScannerClient): Promise<void> {
  let hasPrintedWaitingMessage = false;
  while (!(await isReadyToScan(scanner))) {
    debug('not ready yet, sleeping a bit');
    if (!hasPrintedWaitingMessage) {
      hasPrintedWaitingMessage = true;
      process.stderr.write('waiting for paper…\n');
    }
    await sleep(100);
  }
}

async function isReadyToScan(scanner: ScannerClient): Promise<boolean> {
  debug('getting paper status');
  return (
    (await scanner.getPaperStatus()).unsafeUnwrap() ===
    PaperStatus.VtmReadyToScan
  );
}

async function sleep(duration: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, duration);
  });
}
