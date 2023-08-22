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
  ).toMatchInlineSnapshot(`
    [ZodError: [
      {
        "code": "custom",
        "message": "marginal mark threshold must be less than or equal to definite mark threshold",
        "path": [
          "markThresholds"
        ]
      }
    ]]
  `);

  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        markThresholds: { marginal: 0.3 },
      })
    ).unsafeUnwrapErr()
  ).toMatchInlineSnapshot(`
    [ZodError: [
      {
        "code": "invalid_type",
        "expected": "number",
        "received": "undefined",
        "path": [
          "markThresholds",
          "definite"
        ],
        "message": "Required"
      }
    ]]
  `);

  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        markThresholds: { definite: 1.2, marginal: 0.3 },
      })
    ).unsafeUnwrapErr()
  ).toMatchInlineSnapshot(`
    [ZodError: [
      {
        "code": "too_big",
        "maximum": 1,
        "type": "number",
        "inclusive": true,
        "message": "Number must be less than or equal to 1",
        "path": [
          "markThresholds",
          "definite"
        ]
      }
    ]]
  `);
});
