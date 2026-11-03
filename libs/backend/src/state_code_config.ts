import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type StateCode, StateCodeSchema, safeParse } from '@votingworks/types';
import { getMockStateRootDir } from '@votingworks/utils';

const STATE_CODE_OVERRIDE_FILENAME = 'state-code';

export function getDevStateCodeOverrideDir(repoRoot: string): string {
  return path.join(getMockStateRootDir(repoRoot), 'vx-config');
}

export function readDevStateCodeOverride(
  devRoot: string
): StateCode | undefined {
  const filePath = path.join(devRoot, STATE_CODE_OVERRIDE_FILENAME);
  if (!existsSync(filePath)) return undefined;
  return safeParse(
    StateCodeSchema,
    readFileSync(filePath, 'utf-8').trim()
  ).ok();
}

export function writeDevStateCodeOverride(
  devRoot: string,
  stateCode: StateCode
): void {
  mkdirSync(devRoot, { recursive: true });
  writeFileSync(
    path.join(devRoot, STATE_CODE_OVERRIDE_FILENAME),
    `${stateCode}\n`
  );
}
