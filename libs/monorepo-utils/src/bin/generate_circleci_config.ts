import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { generateAllConfigs } from '../circleci.js';
import { getWorkspacePackageInfo } from '../pnpm.js';

// This file compiles to `build/bin/`, so the repo root is four levels up.
const workspaceRoot = join(import.meta.dirname, '..', '..', '..', '..');

const packageInfo = getWorkspacePackageInfo(workspaceRoot);
for (const [filePath, fileContents] of generateAllConfigs(packageInfo)) {
  process.stdout.write(`Writing CircleCI config to ${filePath}\n`);
  writeFileSync(filePath, fileContents);
}
