import {
  BallotPackage,
  DEFAULT_SYSTEM_SETTINGS,
  safeParseElectionDefinition,
  safeParseSystemSettings,
} from '@votingworks/types';
import { Buffer } from 'buffer';
import 'fast-text-encoding';
import {
  getFileByName,
  maybeGetFileByName,
  readFile,
  openZip,
  getEntries,
  readTextEntry,
} from './file_reading';

export async function readBallotPackageFromBuffer(
  source: Buffer
): Promise<BallotPackage> {
  const zipfile = await openZip(source);
  const zipName = 'ballot package';
  const entries = getEntries(zipfile);
  const electionEntry = getFileByName(entries, 'election.json', zipName);

  let systemSettingsData = JSON.stringify(DEFAULT_SYSTEM_SETTINGS);

  const systemSettingsEntry = maybeGetFileByName(
    entries,
    'systemSettings.json'
  );
  if (systemSettingsEntry) {
    systemSettingsData = await readTextEntry(systemSettingsEntry);
  }

  const electionData = await readTextEntry(electionEntry);

  return {
    electionDefinition:
      safeParseElectionDefinition(electionData).unsafeUnwrap(),
    systemSettings: safeParseSystemSettings(systemSettingsData).unsafeUnwrap(),
  };
}

export async function readBallotPackageFromFile(
  file: File
): Promise<BallotPackage> {
  return readBallotPackageFromBuffer(await readFile(file));
}
