import { expect, test } from 'vitest';
import { SystemSettings } from '@votingworks/types';

import {
  SLI_DEFAULT_SYSTEM_SETTINGS,
  stateDefaultSystemSettings,
} from './system_settings';

// This test is meant to catch accidental changes to default system settings. If a change is
// intentional, simply update the snapshot.
test.each<{ identifier: string; systemSettings: SystemSettings }>([
  ...Object.entries(stateDefaultSystemSettings).map(
    ([identifier, systemSettings]) => ({ identifier, systemSettings })
  ),
  { identifier: 'SLI', systemSettings: SLI_DEFAULT_SYSTEM_SETTINGS },
])(
  'Default system settings for $identifier - If a change is intentional, update snapshot',
  ({ systemSettings }) => {
    expect(systemSettings).toMatchSnapshot();
  }
);
