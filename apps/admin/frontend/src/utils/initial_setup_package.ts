import { Buffer } from 'buffer';

import {
  readFile,
  openZip,
  getEntries,
  readTextEntry,
  getFileByName,
} from '@votingworks/utils';
import { BallotPackageFileName } from '@votingworks/types';

// InitialAdminSetupPackage models the zip file read in by VxAdmin when a system admin configures the machine.
// It's the delivery method for the system settings file.
// VxAdmin is the only machine to read system settings this way; other machines read system settings
// in via the ballot package which is exported by Vx Therefore we need a different way for
// VxAdmin to ingest system settings.
export interface InitialAdminSetupPackage {
  systemSettingsString: string;
  electionString: string;
}

async function readInitialAdminSetupPackageFromBuffer(
  source: Buffer
): Promise<InitialAdminSetupPackage> {
  const zipfile = await openZip(source);
  const entries = getEntries(zipfile);

  const electionEntry = getFileByName(entries, BallotPackageFileName.ELECTION);
  const electionString = await readTextEntry(electionEntry);

  const systemSettingsEntry = getFileByName(
    entries,
    BallotPackageFileName.SYSTEM_SETTINGS
  );
  const systemSettingsString = await readTextEntry(systemSettingsEntry);

  // TODO(kofi): Import translation/audio files as well.

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
