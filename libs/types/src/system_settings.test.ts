import { assert } from '@votingworks/basics';

import {
  DEFAULT_SYSTEM_SETTINGS,
  safeParseSystemSettings,
} from './system_settings';

const systemSettingsString = JSON.stringify(DEFAULT_SYSTEM_SETTINGS);

test('safeParseSystemSettings safely parses valid system settings', () => {
  const parsed = safeParseSystemSettings(systemSettingsString);
  assert(parsed.isOk());
  expect(parsed.unsafeUnwrap()).toEqual(DEFAULT_SYSTEM_SETTINGS);
});

test('safeParseSystemSettings returns an error for malformed system settings', () => {
  const parsed = safeParseSystemSettings(JSON.stringify({ invalid: 'field' }));
  assert(parsed.isErr());
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
