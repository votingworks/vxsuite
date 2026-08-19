/* istanbul ignore file */
/**
 * Runs every cell of the matrix through the real printer code path and records
 * the exact `lp` invocation, with the CUPS clients shimmed onto PATH.
 *
 * `VX_PROOF_BASELINE=1` selects the pre-change calling convention, where the
 * caller asks for M404n support per job. Otherwise the branch-under-test
 * convention is used, where the caller asks for nothing and the printer layer
 * injects from config. That difference is the whole change being proved.
 *
 * Usage: driver.ts <capture-dir> <out-file>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { LogSource, BaseLogger } from '@votingworks/logging';
import { detectPrinter } from '../../src/printer/printer';
import type { PrintProps } from '../../src/printer/types';
import { CELLS } from './cells';

const DATA = Uint8Array.from(Buffer.from('%PDF-1.7 proof fixture\n'));
const BASELINE = process.env['VX_PROOF_BASELINE'] === '1';

export async function main(): Promise<void> {
  const [, , captureDir, outFile] = process.argv;
  const printer = detectPrinter(new BaseLogger(LogSource.System));
  await printer.status();

  const captured: Array<{ cell: string; argv: string[]; stdinSha: string }> =
    [];
  for (const cell of CELLS) {
    const options: PrintProps = { ...cell.options, data: DATA };
    // The baseline API carried a per-job flag that no longer exists.
    const withFlag =
      BASELINE && cell.baselineSetsFlag
        ? { ...options, isM404nSupportRequired: true }
        : options;
    await printer.print(withFlag);

    captured.push({
      cell: cell.name,
      argv: readFileSync(join(captureDir, 'lp-argv'), 'utf8')
        .split('\0')
        .slice(0, -1),
      stdinSha: readFileSync(join(captureDir, 'lp-stdin-sha'), 'utf8').trim(),
    });
  }

  writeFileSync(outFile, `${JSON.stringify(captured, null, 2)}\n`);
}
