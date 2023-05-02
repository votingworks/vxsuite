import { assert } from '@votingworks/basics';
import { systemSettings } from '@votingworks/fixtures';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';

import { safeParseSystemSettings } from './system_settings';

test('safeParseSystemSettings safely parses valid system settings', () => {
  const systemSettingsString = systemSettings.asText();
  const parsed = safeParseSystemSettings(systemSettingsString);
  assert(parsed.isOk());
  expect(parsed.unsafeUnwrap()).toEqual(DEFAULT_SYSTEM_SETTINGS);
});

test('safeParseSystemSettings returns an error for malformed system settings', () => {
  const parsed = safeParseSystemSettings(JSON.stringify({ invalid: 'field' }));
  assert(parsed.isErr());
});
