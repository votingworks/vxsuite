/* istanbul ignore file */

import * as dotenv from 'dotenv';
import * as dotenvExpand from 'dotenv-expand';
import fs from 'node:fs';
import { isIntegrationTest } from '@votingworks/utils';

/**
 * Loads environment variables from .env* files. dotenv will never modify environment variables
 * that have already been set.
 *
 * https://github.com/motdotla/dotenv
 * https://github.com/motdotla/dotenv-expand
 */
export function loadEnvVarsFromDotenvFiles(): void {
  const nodeEnv = process.env.NODE_ENV;
  const isTestEnvironment = nodeEnv === 'test' || isIntegrationTest();

  // https://github.com/bkeepers/dotenv#what-other-env-files-can-i-use
  const dotenvPath = '.env';
  const dotenvFiles: string[] = [
    `${dotenvPath}.${nodeEnv}.local`,
    // Don't include `.env.local` in test environments since we expect tests to produce the same
    // results for everyone
    !isTestEnvironment ? `${dotenvPath}.local` : '',
    `${dotenvPath}.${nodeEnv}`,
    dotenvPath,
    !isTestEnvironment ? `../../../${dotenvPath}.local` : '',
    `../../../${dotenvPath}`,
  ].filter(Boolean);

  for (const dotenvFile of dotenvFiles) {
    if (fs.existsSync(dotenvFile)) {
      dotenvExpand.expand(dotenv.config({ path: dotenvFile }));
    }
  }
}
