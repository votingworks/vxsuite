import path from 'node:path';
import {
  getRequiredEnvVar,
  isIntegrationTest,
  isNodeEnvProduction,
} from '@votingworks/utils';
import { execFile } from '../exec.js';
import { intermediateScript } from '../intermediate_scripts.js';

function isProductionMachine(): boolean {
  return isNodeEnvProduction() && !isIntegrationTest();
}

/**
 * Gets the location of the lifetime sheet count file: under `VX_CONFIG_ROOT`
 * on production machines, otherwise under `devRoot`.
 */
export function getLifetimeSheetCountFilePath({
  devRoot,
}: {
  devRoot: string;
}): string {
  return path.join(
    isProductionMachine() ? getRequiredEnvVar('VX_CONFIG_ROOT') : devRoot,
    'lifetime-sheet-count'
  );
}

/**
 * Increments the lifetime sheet count on this machine.
 */
export async function incrementLifetimeSheetCount({
  devRoot,
}: {
  devRoot: string;
}): Promise<void> {
  const script = intermediateScript('increment-lifetime-sheet-count');
  const lifetimeSheetCountFilePath = getLifetimeSheetCountFilePath({ devRoot });
  try {
    if (isProductionMachine()) {
      await execFile('sudo', [script, lifetimeSheetCountFilePath]);
    } else {
      await execFile(script, [lifetimeSheetCountFilePath]);
    }
  } catch (err) {
    const error = err as Error;
    if ('stderr' in error) {
      throw new Error((error as unknown as { stderr: string }).stderr);
    } else {
      throw error;
    }
  }
}
