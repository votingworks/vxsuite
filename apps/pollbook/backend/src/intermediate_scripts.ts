import path from 'node:path';

/**
 * For shell commands that require sudo privileges, we create intermediate scripts and allow them
 * to be run without having to provide the sudo password by explicitly adding them to the sudoers
 * file (defined in vxsuite-complete-system).
 */
export function intermediateScript(
  script:
    | 'reset-network'
    | 'avahi-publish-service'
    | 'avahi-browse'
    | 'is-online'
): string {
  // Prefix with ../src since we're actually in ../build at runtime
  return path.join(__dirname, '../intermediate-scripts', script);
}
