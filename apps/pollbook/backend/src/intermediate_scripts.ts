import path from 'node:path';

/**
 * PollBook-specific intermediate scripts that require sudo privileges.
 * Avahi-related scripts have been moved to @votingworks/networking.
 */
export function intermediateScript(script: 'reset-network'): string {
  // Prefix with ../src since we're actually in ../build at runtime
  return path.join(__dirname, '../intermediate-scripts', script);
}
