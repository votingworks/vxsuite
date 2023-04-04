import { systemSettings } from '@votingworks/fixtures';
import { assert } from 'console';
import { safeParseSystemSettings } from './system_settings';

test('safeParseSystemSettings safely parses valid system settings', () => {
  const systemSettingsString = systemSettings.asText();
  const parsed = safeParseSystemSettings(systemSettingsString);
  assert(parsed.isOk());
  expect(parsed.unsafeUnwrap()).toEqual({
    arePollWorkerCardPinsEnabled: true,
  });
});

test('safeParseSystemSettings returns an error for malformed system settings', () => {
  const parsed = safeParseSystemSettings(JSON.stringify({ invalid: 'field' }));
  assert(parsed.isErr());
});
