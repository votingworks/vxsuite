/* eslint-disable no-console */
// PoC harness: drive the real DeskProScanner against the live SCAMAX bridge and
// confirm every produced PNG is readable by vxsuite's loadImageData (the same
// reader the importer uses). Run with esbuild-runner:
//   node -r esbuild-runner/register src/deskpro_demo.ts [maxSheets]
import { BaseLogger, LogSource } from '@votingworks/logging';
import { safeParseInt } from '@votingworks/types';
import assert from 'node:assert';
import { mkdirSync, rmSync } from 'node:fs';
import { DeskProScanner } from './deskpro_scanner';

async function main(): Promise<void> {
  const maxSheets = process.argv[2]
    ? safeParseInt(process.argv[2]).unsafeUnwrap()
    : Infinity;
  const directory = '/tmp/deskpro-demo';
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });

  const scanner = new DeskProScanner({
    logger: new BaseLogger(LogSource.VxCentralScanService),
  });
  const batch = scanner.scanSheets({ directory });

  let n = 0;
  for (;;) {
    const sheet = await batch.scanSheet();
    if (!sheet) break;
    n += 1;
    const { front, back } = sheet;
    assert(typeof front !== 'string');
    assert(typeof back !== 'string');
    console.log(
      `sheet ${n}: front ${front.width}x${front.height} back ${back.width}x${back.height}`
    );
    if (n >= maxSheets) {
      console.log(`reached maxSheets=${maxSheets}, stopping batch`);
      await batch.endBatch();
      break;
    }
  }
  console.log(`DONE: ${n} sheets, all images decoded by loadImageData`);
  process.exit(0);
}

void main();
