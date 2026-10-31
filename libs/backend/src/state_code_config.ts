import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type StateCode, StateCodeSchema, safeParse } from '@votingworks/types';
import {
  getMockStateRootDir,
  getRequiredEnvVar,
  isIntegrationTest,
  isNodeEnvProduction,
} from '@votingworks/utils';

const STATE_CODE_FILENAME = 'state-code';

export function getDevVxConfigRoot(repoRoot: string): string {
  return path.join(getMockStateRootDir(repoRoot), 'vx-config');
}

export function getStateCodeConfigFilePath({
  devRoot,
}: {
  devRoot: string;
}): string {
  return path.join(
    isNodeEnvProduction() && !isIntegrationTest()
      ? getRequiredEnvVar('VX_CONFIG_ROOT')
      : devRoot,
    STATE_CODE_FILENAME
  );
}

export function readStateCodeConfig({
  devRoot,
}: {
  devRoot: string;
}): StateCode | undefined {
  const filePath = getStateCodeConfigFilePath({ devRoot });
  if (!existsSync(filePath)) return undefined;
  return safeParse(
    StateCodeSchema,
    readFileSync(filePath, 'utf-8').trim()
  ).ok();
}

export function writeStateCodeConfig({
  devRoot,
  stateCode,
}: {
  devRoot: string;
  stateCode: StateCode;
}): void {
  mkdirSync(devRoot, { recursive: true });
  writeFileSync(getStateCodeConfigFilePath({ devRoot }), `${stateCode}\n`);
}
