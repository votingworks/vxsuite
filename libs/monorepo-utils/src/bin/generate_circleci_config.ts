import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { generateAllConfigs } from '../circleci';
import { getWorkspacePackageInfo } from '../pnpm';

// This file compiles to `build/bin/`, so the repo root is four levels up.
const workspaceRoot = join(__dirname, '..', '..', '..', '..');

const packageInfo = getWorkspacePackageInfo(workspaceRoot);
for (const [filePath, fileContents] of generateAllConfigs(packageInfo)) {
  process.stdout.write(`Writing CircleCI config to ${filePath}\n`);
  writeFileSync(filePath, fileContents);
}
