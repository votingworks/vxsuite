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
