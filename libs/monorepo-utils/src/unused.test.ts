import { expect, test } from 'vitest';
import { PnpmPackageInfo } from './types';
import { findUnusedPackages } from './unused';

test('findUnusedPackages treats packages with bins as used', () => {
  const pkgs = new Map<string, PnpmPackageInfo>([
    [
      'a',
      {
        name: 'a',
        version: '1.0.0',
        relativePath: 'libs/a',
        path: '/path/to/libs/a',
        packageJson: {
          name: 'a',
          version: '1.0.0',
          bin: 'bin.js',
        },
      },
    ],
  ]);

  expect(findUnusedPackages(pkgs)).toEqual(new Set());
});

test('findUnusedPackages treats non-libs as used', () => {
  const pkgs = new Map<string, PnpmPackageInfo>([
    [
      'a',
      {
        name: 'a',
        version: '1.0.0',
        relativePath: 'apps/a',
        path: '/path/to/apps/a',
      },
    ],
  ]);

  expect(findUnusedPackages(pkgs)).toEqual(new Set());
});

test('findUnusedPackages treats packages without package.json as used', () => {
  const pkgs = new Map<string, PnpmPackageInfo>([
    [
      'a',
      {
        name: 'a',
        version: '1.0.0',
        relativePath: 'libs/a',
        path: '/path/to/libs/a',
      },
    ],
  ]);

  expect(findUnusedPackages(pkgs)).toEqual(new Set());
});

test('findUnusedPackages treats depended-on packages as used', () => {
  const pkgs = new Map<string, PnpmPackageInfo>([
    [
      'some-app',
      {
        name: 'some-app',
        version: '1.0.0',
        relativePath: 'apps/some-app',
        path: '/path/to/apps/some-app',
        packageJson: {
          name: 'some-app',
          version: '1.0.0',
          dependencies: {
            'some-lib': '1.0.0',
          },
        },
      },
    ],
    [
      'some-lib',
      {
        name: 'some-lib',
        version: '1.0.0',
        relativePath: 'libs/some-lib',
        path: '/path/to/libs/some-lib',
        packageJson: {
          name: 'some-lib',
          version: '1.0.0',
        },
      },
    ],
    [
      'unreferenced-lib',
      {
        name: 'unreferenced-lib',
        version: '1.0.0',
        relativePath: 'libs/unreferenced-lib',
        path: '/path/to/libs/unreferenced-lib',
        packageJson: {
          name: 'unreferenced-lib',
          version: '1.0.0',
        },
      },
    ],
  ]);

  expect(findUnusedPackages(pkgs)).toEqual(
    new Set([pkgs.get('unreferenced-lib')])
  );
});
