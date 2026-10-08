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
 * Gets the location of the persistent scan count file: under `VX_CONFIG_ROOT`
 * on production machines, otherwise under `devRoot`.
 */
export function getScanCountFilePath({ devRoot }: { devRoot: string }): string {
  return path.join(
    isProductionMachine() ? getRequiredEnvVar('VX_CONFIG_ROOT') : devRoot,
    'scan-count'
  );
}

/**
 * Increments the persistent scan count on this machine.
 */
export async function incrementScanCount({
  devRoot,
}: {
  devRoot: string;
}): Promise<void> {
  const script = intermediateScript('increment-scan-count');
  const scanCountFilePath = getScanCountFilePath({ devRoot });
  try {
    if (isProductionMachine()) {
      await execFile('sudo', [script, scanCountFilePath]);
    } else {
      await execFile(script, [scanCountFilePath]);
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
