import tmp from 'tmp';
import { safeParseSystemSettings } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { execSync } from 'child_process';
import { join } from 'path';
import * as fsSync from 'fs';
import {
  DEFAULT_SYSTEM_SETTINGS,
  ElectionDefinition,
} from '@votingworks/types';
import { Buffer } from 'buffer';

function parseAndWriteSystemSettings(
  dirPath: string,
  systemSettingsOptions: MockSystemSettingOptions
) {
  const { systemSettingsString, omitSystemSettings } = systemSettingsOptions;
  if (omitSystemSettings) {
    return;
  }

  assert(systemSettingsString !== undefined);
  // For convenience the system settings param is a string, not object, because it's imported in tests as string.
  // But we validate the input before attempting to write. Doing validation first lets us return a human-readable error
  // instead of letting ZodSchema throw.
  if (
    systemSettingsString &&
    safeParseSystemSettings(systemSettingsString).isErr()
  ) {
    throw new Error(
      'System settings string passed was not parsable as a system settings object. Did you import from fixtures and use .asText()?'
    );
  }

  fsSync.writeFileSync(
    join(dirPath, 'systemSettings.json'),
    systemSettingsString || JSON.stringify(DEFAULT_SYSTEM_SETTINGS)
  );
}

/**
 * MockSystemSettingOptions describe how createBallotPackageWithoutTemplates should
 * behave wrt. system settings when creating a ballot package
 */
interface MockSystemSettingOptions {
  // omitSystemSettings is needed to test behavior when ballot packages don't have systemSettings.json
  omitSystemSettings?: boolean;
  systemSettingsString?: string;
}

/**
 * createBallotPackageWithoutTemplates writes a ballot package zip to tmp but omits ballot templates.
 * Loading of HMPB templates is slow, so in some tests we want to skip it by
 * removing the templates from the ballot package.
 * @param electionDefinition Election Definition to write to the ballot package
 * @param systemSettingsOptions MockSystemSettingOptions that describe how to handle system settings
 * @returns
 */
export function createBallotPackageWithoutTemplates(
  electionDefinition: ElectionDefinition,
  systemSettingsOptions: MockSystemSettingOptions = {
    systemSettingsString: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    omitSystemSettings: false,
  }
): Buffer {
  const dirPath = tmp.dirSync().name;
  const zipPath = `${dirPath}.zip`;
  fsSync.writeFileSync(
    join(dirPath, 'election.json'),
    electionDefinition.electionData
  );

  parseAndWriteSystemSettings(dirPath, systemSettingsOptions);
  execSync(`zip -j ${zipPath} ${dirPath}/*`);
  return fsSync.readFileSync(zipPath);
}
