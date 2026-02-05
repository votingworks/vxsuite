import { expect, test } from 'vitest';
import { err, ok } from '@votingworks/basics';

import {
  DEFAULT_SYSTEM_SETTINGS,
  safeParseSystemSettings,
} from './system_settings';

const systemSettingsString = JSON.stringify(DEFAULT_SYSTEM_SETTINGS);

test('safeParseSystemSettings safely parses valid system settings', () => {
  expect(safeParseSystemSettings(systemSettingsString)).toEqual(
    ok(DEFAULT_SYSTEM_SETTINGS)
  );
});

test('safeParseSystemSettings returns an error for malformed system settings', () => {
  expect(safeParseSystemSettings(JSON.stringify({ invalid: 'field' }))).toEqual(
    err(expect.anything())
  );
});

test('disallows invalid mark thresholds', () => {
  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        markThresholds: { definite: 0.2, marginal: 0.3 },
      })
    ).unsafeUnwrapErr()
  ).toMatchSnapshot();

  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        markThresholds: { marginal: 0.3 },
      })
    ).unsafeUnwrapErr()
  ).toMatchSnapshot();

  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        markThresholds: { definite: 1.2, marginal: 0.3 },
      })
    ).unsafeUnwrapErr()
  ).toMatchSnapshot();
});

test('disallows invalid adjudication reasons', () => {
  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        precinctScanAdjudicationReasons: ['abcdefg'],
        centralScanAdjudicationReasons: ['abcdefg'],
        adminAdjudicationReasons: ['abcdefg'],
      })
    ).unsafeUnwrapErr()
  ).toMatchSnapshot();

  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        centralScanAdjudicationReasons: 'foooo',
      })
    ).unsafeUnwrapErr()
  ).toMatchSnapshot();
});

test('disallows retry streak threshold greater than or equal to normal threshold', () => {
  // Valid: retry threshold less than normal threshold
  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        maxCumulativeStreakWidth: 5,
        retryStreakWidthThreshold: 1,
      })
    )
  ).toEqual(
    ok({
      ...DEFAULT_SYSTEM_SETTINGS,
      maxCumulativeStreakWidth: 5,
      retryStreakWidthThreshold: 1,
    })
  );

  // Invalid: retry threshold equal to normal threshold
  // (pointless since the check is deterministic)
  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        maxCumulativeStreakWidth: 5,
        retryStreakWidthThreshold: 5,
      })
    ).unsafeUnwrapErr()
  ).toMatchSnapshot();

  // Invalid: retry threshold greater than normal threshold
  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        maxCumulativeStreakWidth: 5,
        retryStreakWidthThreshold: 10,
      })
    ).unsafeUnwrapErr()
  ).toMatchSnapshot();
});
