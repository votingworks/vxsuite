import type { SystemSettings } from '@votingworks/types';
import {
  SLI_DEFAULT_SYSTEM_SETTINGS,
  stateDefaultSystemSettings,
} from '@votingworks/election-definition-backend';
import { sliOrganizationId } from './globals.js';
import { type Jurisdiction, resultsReportingUrl } from './types.js';

export function defaultSystemSettings(
  jurisdiction: Jurisdiction
): SystemSettings {
  if (jurisdiction.organization.id === sliOrganizationId()) {
    return SLI_DEFAULT_SYSTEM_SETTINGS;
  }
  return stateDefaultSystemSettings(jurisdiction.stateCode, {
    quickResultsReportingUrl: resultsReportingUrl(),
  });
}
