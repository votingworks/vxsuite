import type { ElectionDefinition } from '@votingworks/types';
import {
  generateElectionBasedSubfolderName,
  REPORT_FOLDER,
} from '@votingworks/utils';
import { join } from 'node:path';

/**
 * Generate a subfolder to place election-specific reports in.
 */
export function generateReportsDirectoryPath(
  electionDefinition: ElectionDefinition
): string {
  return join(
    generateElectionBasedSubfolderName(
      electionDefinition.election,
      electionDefinition.ballotHash
    ),
    REPORT_FOLDER
  );
}

/**
 * Generate the full path for a report file. Useful for testing.
 */
export function generateReportPath(
  electionDefinition: ElectionDefinition,
  filename: string
): string {
  return join(generateReportsDirectoryPath(electionDefinition), filename);
}

/**
 * Replaces path separators and characters that FAT and exFAT USB drives
 * reject, so the name saves as a single file in the target directory.
 */
export function sanitizeFilenameForUsbDrive(filename: string): string {
  return filename.replace(/[\\/:*?"<>|]/g, '_');
}
