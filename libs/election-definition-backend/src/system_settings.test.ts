import { expect, test } from 'vitest';
import type { SystemSettings } from '@votingworks/types';

import { StateCodes } from './state_features.js';
import {
  SLI_DEFAULT_SYSTEM_SETTINGS,
  stateDefaultSystemSettings,
} from './system_settings.js';

const quickResultsReportingUrl = 'http://localhost:3000/report';

// This test is meant to catch accidental changes to default system settings. If a change is
// intentional, simply update the snapshot.
test.each<{ identifier: string; systemSettings: SystemSettings }>([
  ...StateCodes.map((stateCode) => ({
    identifier: stateCode,
    systemSettings: stateDefaultSystemSettings(stateCode, {
      quickResultsReportingUrl,
    }),
  })),
  { identifier: 'SLI', systemSettings: SLI_DEFAULT_SYSTEM_SETTINGS },
])(
  'Default system settings for $identifier - If a change is intentional, update snapshot',
  ({ systemSettings }) => {
    expect(systemSettings).toMatchSnapshot();
  }
);

test('stateDefaultSystemSettings omits quick results reporting without a URL', () => {
  for (const stateCode of StateCodes) {
    expect(stateDefaultSystemSettings(stateCode)).toEqual({
      ...stateDefaultSystemSettings(stateCode, { quickResultsReportingUrl }),
      quickResultsReportingUrl: undefined,
    });
    expect(stateDefaultSystemSettings(stateCode)).not.toHaveProperty(
      'quickResultsReportingUrl'
    );
  }
});
