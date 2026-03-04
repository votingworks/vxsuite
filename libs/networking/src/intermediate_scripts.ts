import path from 'node:path';

/**
 * Resolves the path to an intermediate script that requires elevated privileges.
 * These scripts are added to the sudoers file on production machines.
 */
export function intermediateScript(
  script: 'avahi-publish-service' | 'avahi-browse' | 'is-online'
): string {
  // Prefix with ../src since we're actually in ../build at runtime
  return path.join(__dirname, '../intermediate-scripts', script);
}
