import { expect, test } from 'vitest';
import {
  DiskSpaceSummary,
  getLowDiskSpaceWarningMessage,
} from './disk_space_summary';

test('getLowDiskSpaceWarningMessage returns undefined when disk space is sufficient', () => {
  const summary: DiskSpaceSummary = {
    total: 10_000_000,
    used: 1_000_000,
    available: 9_000_000,
  };
  expect(getLowDiskSpaceWarningMessage(summary)).toBeUndefined();
});

test('getLowDiskSpaceWarningMessage returns warning message when disk space is low', () => {
  const summary: DiskSpaceSummary = {
    total: 1000,
    used: 990,
    available: 10,
  };
  expect(getLowDiskSpaceWarningMessage(summary)).toEqual(
    'Free disk space is down to 1% (10.0 KB of 1000.0 KB).'
  );
});

test('getLowDiskSpaceWarningMessage returns warning message at threshold boundary', () => {
  const summary: DiskSpaceSummary = {
    total: 10_000_000,
    used: 9_500_000,
    available: 500_000,
  };
  expect(getLowDiskSpaceWarningMessage(summary)).toEqual(
    'Free disk space is down to 5% (488.3 MB of 9.5 GB).'
  );
});
