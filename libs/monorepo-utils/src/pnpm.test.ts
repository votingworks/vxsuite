import { expect, test } from 'vitest';
import { relative } from 'node:path';
import { getWorkspacePackageInfo, getWorkspacePackagePaths } from './pnpm';

test('getWorkspacePackagePaths', () => {
  expect(getWorkspacePackagePaths(__dirname)).toEqual(
    expect.arrayContaining([
      // workspace root
      '../../..',
      // this package
      '..',
      // basics, as an example library
      '../../basics',
    ])
  );
  expect(getWorkspacePackagePaths(relative(process.cwd(), __dirname))).toEqual(
    expect.arrayContaining([
      // workspace root
      '../../..',
      // this package
      '..',
      // basics, as an example library
      '../../basics',
    ])
  );
});

test('getWorkspacePackageInfo', () => {
  const packages = getWorkspacePackageInfo(__dirname);

  // workspace root
  expect(packages.get('vxpollbook')).toEqual(
    expect.objectContaining({
      name: 'vxpollbook',
    })
  );

  // this package
  expect(packages.get('@votingworks/monorepo-utils')).toEqual(
    expect.objectContaining({
      name: '@votingworks/monorepo-utils',
    })
  );

  // basics, as an example library
  expect(packages.get('@votingworks/basics')).toEqual(
    expect.objectContaining({
      name: '@votingworks/basics',
    })
  );
});
