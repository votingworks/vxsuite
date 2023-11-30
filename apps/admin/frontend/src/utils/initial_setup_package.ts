import { Buffer } from 'buffer';

import {
  readFile,
  openZip,
  getEntries,
  readTextEntry,
  getFileByName,
} from '@votingworks/utils';
import { BallotPackageFileName } from '@votingworks/types';
import type { ConfigureError } from '@votingworks/admin-backend';
import { Result, ok, err } from '@votingworks/basics';

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
): Promise<Result<InitialAdminSetupPackage, ConfigureError>> {
  let electionString: string;
  let systemSettingsString: string;

  try {
    const zipfile = await openZip(source);
    const entries = getEntries(zipfile);
    const electionEntry = getFileByName(
      entries,
      BallotPackageFileName.ELECTION
    );
    electionString = await readTextEntry(electionEntry);
    const systemSettingsEntry = getFileByName(
      entries,
      BallotPackageFileName.SYSTEM_SETTINGS
    );
    systemSettingsString = await readTextEntry(systemSettingsEntry);

    // TODO(kofi): Import translation/audio files as well.

    return ok({
      electionString,
      systemSettingsString,
    });
  } catch (error) {
    return err({ type: 'invalidZip', message: String(error) });
  }
}

export async function readInitialAdminSetupPackageFromFile(
  file: File
): Promise<Result<InitialAdminSetupPackage, ConfigureError>> {
  return readInitialAdminSetupPackageFromBuffer(await readFile(file));
}
