import path from 'node:path';

/**
 * Returns the path to an intermediate shell script bundled with this package.
 * These scripts require elevated privileges and should be added to the sudoers
 * file on production machines.
 */
export function intermediateScript(
  script: 'avahi-publish-service' | 'avahi-browse' | 'is-online'
): string {
  // At runtime we're in build/, so go up one level to reach intermediate-scripts/
  return path.join(__dirname, '../intermediate-scripts', script);
}
