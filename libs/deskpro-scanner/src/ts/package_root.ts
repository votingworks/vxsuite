import { createRequire } from 'node:module';
import { dirname } from 'node:path';

/** This package's directory, found through its own `exports` rather than the module's depth. */
export const PACKAGE_ROOT = dirname(
  createRequire(import.meta.url).resolve(
    '@votingworks/deskpro-scanner/package.json'
  )
);
