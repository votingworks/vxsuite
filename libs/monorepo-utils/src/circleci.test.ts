import { join } from 'path';
import { generateConfig } from './circleci';
import { getWorkspacePackageInfo } from './pnpm';

test('generateConfig', () => {
  expect(
    generateConfig(getWorkspacePackageInfo(join(__dirname, '../../..')))
  ).toContain('test-libs-basics');
});
