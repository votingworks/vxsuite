import { Buffer } from 'buffer';

import {
  readFile,
  openZip,
  getEntries,
  readTextEntry,
  getFileByName,
} from '@votingworks/utils';

// InitialAdminSetupPackage models the zip file read in by VxAdmin when a system admin configures the machine.
// It's the delivery method for the system settings file.
// VxAdmin is the only machine to read system settings this way; other machines read system settings
// in via the ballot package which is exported by VxAdmin. Therefore we need a different way for
// VxAdmin to ingest system settings.
export interface InitialAdminSetupPackage {
  systemSettingsString: string;
  electionString: string;
}

async function readInitialAdminSetupPackageFromBuffer(
  source: Buffer
): Promise<InitialAdminSetupPackage> {
  console.log('readInitialAdminSetupPackageFromBuffer opening zip');
  const zipfile = await openZip(source);
  const entries = getEntries(zipfile);

  console.log('Opened zip, reading election');

  const electionEntry = getFileByName(entries, 'election.json');
  const electionString = await readTextEntry(electionEntry);

  /**
   * Observe when running the test:
   * ```
   *  Cannot log after tests are done. Did you forget to wait for something async in your test?
    Attempted to log "Done reading election, reading system settings".
    ```
   */

  console.log('Done reading election, reading system settings');
  const systemSettingsEntry = getFileByName(entries, 'systemSettings.json');
  const systemSettingsString = await readTextEntry(systemSettingsEntry);

  console.log('Returning setup package');
  return {
    electionString,
    systemSettingsString,
  };
}

export async function readInitialAdminSetupPackageFromFile(
  file: File
): Promise<InitialAdminSetupPackage> {
  return readInitialAdminSetupPackageFromBuffer(await readFile(file));
}
