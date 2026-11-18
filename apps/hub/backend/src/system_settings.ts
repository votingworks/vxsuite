import {
  AdjudicationReason,
  DEFAULT_MARK_THRESHOLDS,
  DEFAULT_MARK_THRESHOLDS_MARGINAL_MARK_ADJUDICATION_ENABLED,
  DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH,
  DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD,
  DEFAULT_SYSTEM_SETTINGS,
  type SystemSettings,
} from '@votingworks/types';

import type { StateCode } from '@votingworks/election-definition-backend';
import { sliOrganizationId } from './globals.js';
import { type Jurisdiction, resultsReportingUrl } from './types.js';

export function defaultSystemSettings(
  jurisdiction: Jurisdiction
): SystemSettings {
  if (jurisdiction.organization.id === sliOrganizationId()) {
    return SLI_DEFAULT_SYSTEM_SETTINGS;
  }
  return stateDefaultSystemSettings[jurisdiction.stateCode];
}
