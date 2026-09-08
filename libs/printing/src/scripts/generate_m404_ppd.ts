import { readFileSync, writeFileSync } from 'node:fs';
import {
  deriveM404Ppd,
  getPpdPath,
  HP_4001_PRINTER_CONFIG,
  HP_M404_PRINTER_CONFIG,
} from '../printer/supported.js';

/**
 * Derives the HP LaserJet Pro M404 PPD from the generic PPD and writes it to
 * the appropriate source code location. See {@link deriveM404Ppd} for more
 * details.
 */
export function main(): void {
  const genericPpd = readFileSync(getPpdPath(HP_4001_PRINTER_CONFIG), 'utf8');
  const m404PpdPath = getPpdPath(HP_M404_PRINTER_CONFIG);
  writeFileSync(m404PpdPath, deriveM404Ppd(genericPpd));
  console.log(`Wrote ${m404PpdPath}`);
}
