import { readFileSync, writeFileSync } from 'node:fs';
import {
  deriveM404nPpd,
  getPpdPath,
  HP_LASER_PRINTER_CONFIG,
  M404N_PRINTER_CONFIG,
} from '../src/printer/supported';

/**
 * Derives the HP LaserJet Pro M404n PPD from the generic PPD and writes it to
 * the appropriate source code location. See {@link deriveM404nPpd} for more
 * details.
 */
export function main(): void {
  const genericPpd = readFileSync(getPpdPath(HP_LASER_PRINTER_CONFIG), 'utf8');
  const m404nPpdPath = getPpdPath(M404N_PRINTER_CONFIG);
  writeFileSync(m404nPpdPath, deriveM404nPpd(genericPpd));
  console.log(`Wrote ${m404nPpdPath}`);
}
