import { basename } from 'node:path';
import { extractErrorMessage, iter } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import { BackupManifest } from '../backup_manifest.js';
import { StyledPrinter } from './styled_printer.js';

const LABEL_WIDTH = 8;

function label(printer: StyledPrinter, text: string): string {
  return printer.style('dim', text.padEnd(LABEL_WIDTH));
}

/**
 * Renders a tree-style summary of a backup:
 *
 *   ● franklin-county_general-election_e13505110f
 *   │  Election  General Election · 2020-11-03
 *   │  Created   10/30/2020, 6:12 AM · machine 0000 · dev
 *   ╰─ Files     2,004 (297.3 MB)
 */
export function backupInfo(
  printer: StyledPrinter,
  { path, manifest }: { path: string; manifest: BackupManifest }
): void {
  printer.println(printer.style(['bold', 'cyan'], `● ${basename(path)}`));
  printer.println(
    printer.style('dim', '│'),
    '  ',
    label(printer, 'Election'),
    '  ',
    `${manifest.election.title} · ${manifest.election.date.toISOString()}`
  );
  printer.println(
    printer.style('dim', '│'),
    '  ',
    label(printer, 'Created'),
    '  ',
    format.localeShortDateAndTime(new Date(manifest.createdAt)),
    ' · ',
    printer.style('dim', 'machine'),
    ` ${manifest.machineId} · `,
    printer.style('dim', manifest.softwareVersion)
  );
  printer.println(
    printer.style('dim', '╰─'),
    ' ',
    label(printer, 'Files'),
    '  ',
    format.count(manifest.files.length),
    ` (${format.bytes(iter(manifest.files).sum(({ size }) => size))})`
  );
}

/**
 * Renders a warning for a backup whose manifest could not be read.
 */
export function unreadableManifest(
  printer: StyledPrinter,
  { manifestPath, error }: { manifestPath: string; error: unknown }
): void {
  printer.println(
    printer.style(
      'red',
      `[Unreadable Manifest] ${manifestPath} is invalid: ${extractErrorMessage(
        error
      )}`
    )
  );
}
