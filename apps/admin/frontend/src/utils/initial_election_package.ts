import { Buffer } from 'buffer';

import {
  readFile,
  openZip,
  getEntries,
  readTextEntry,
  getFileByName,
} from '@votingworks/utils';
import { ElectionPackageFileName } from '@votingworks/types';
import type { ConfigureError } from '@votingworks/admin-backend';
import { Result, ok, err } from '@votingworks/basics';

// InitialAdminElectionPackage models the unsigned election package exported from
// VxDesign and imported into VxAdmin.
export interface InitialAdminElectionPackage {
  systemSettingsString: string;
  electionString: string;
}

async function readInitialAdminElectionPackageFromBuffer(
  source: Buffer
): Promise<Result<InitialAdminElectionPackage, ConfigureError>> {
  let electionString: string;
  let systemSettingsString: string;

  try {
    const zipfile = await openZip(source);
    const entries = getEntries(zipfile);
    const electionEntry = getFileByName(
      entries,
      ElectionPackageFileName.ELECTION
    );
    electionString = await readTextEntry(electionEntry);
    const systemSettingsEntry = getFileByName(
      entries,
      ElectionPackageFileName.SYSTEM_SETTINGS
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

export async function readInitialAdminElectionPackageFromFile(
  file: File
): Promise<Result<InitialAdminElectionPackage, ConfigureError>> {
  return readInitialAdminElectionPackageFromBuffer(await readFile(file));
}
