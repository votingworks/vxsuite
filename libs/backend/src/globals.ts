import { assert, throwIllegalValue } from '@votingworks/basics';
import { DEV_MACHINE_ID } from '@votingworks/types';
import {
  DEV_MOCK_USB_DRIVE_GLOB_PATTERN,
  REAL_USB_DRIVE_GLOB_PATTERN,
} from '@votingworks/usb-drive';
import { isIntegrationTest } from '@votingworks/utils';

const VALID_NODE_ENVS = ['development', 'production', 'test'] as const;

/**
 * Possible values for the NODE_ENV environment variable.
 */
export type NODE_ENV = (typeof VALID_NODE_ENVS)[number];

/**
 * What's the unique ID for this machine?
 */
export function getMachineId(): string {
  return process.env.VX_MACHINE_ID ?? DEV_MACHINE_ID;
}

/**
 * Which node environment is this?
 */
export function getNodeEnv(): NODE_ENV {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  assert(
    VALID_NODE_ENVS.includes(nodeEnv),
    `NODE_ENV should be one of ${VALID_NODE_ENVS.join(', ')}`
  );
  return nodeEnv;
}

/**
 * Where are exported files allowed to be written to? `additionalPatterns` are
 * for apps that write export data somewhere else on its way to a USB drive,
 * e.g. a temporary directory used while building a signature file.
 */
export function getAllowedExportPatterns(
  additionalPatterns: readonly string[] = []
): string[] {
  const nodeEnv = getNodeEnv();

  switch (nodeEnv) {
    case 'production':
      return isIntegrationTest()
        ? [
            REAL_USB_DRIVE_GLOB_PATTERN,
            DEV_MOCK_USB_DRIVE_GLOB_PATTERN,
            ...additionalPatterns,
          ]
        : [REAL_USB_DRIVE_GLOB_PATTERN, ...additionalPatterns];

    case 'development':
      return [
        REAL_USB_DRIVE_GLOB_PATTERN,
        DEV_MOCK_USB_DRIVE_GLOB_PATTERN,
        ...additionalPatterns,
      ];

    case 'test':
      // Where mock USB drives are created within tests
      return ['/tmp/**/*', DEV_MOCK_USB_DRIVE_GLOB_PATTERN];

    default:
      throwIllegalValue(nodeEnv);
  }
}

/**
 * Where are exported files allowed to be written to?
 */
export function getScanAllowedExportPatterns(): string[] {
  return (
    process.env.SCAN_ALLOWED_EXPORT_PATTERNS?.split(',') ??
    getAllowedExportPatterns()
  );
}
