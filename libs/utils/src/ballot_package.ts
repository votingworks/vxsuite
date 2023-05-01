import {
  BallotLocale,
  BallotPageLayout,
  BallotStyleId,
  ContestId,
  DEFAULT_SYSTEM_SETTINGS,
  ElectionDefinition,
  PrecinctId,
  safeParseElectionDefinition,
  SystemSettings,
} from '@votingworks/types';
import { Buffer } from 'buffer';
import 'fast-text-encoding';
import { safeParseSystemSettings } from './system_settings';
import {
  getFileByName,
  maybeGetFileByName,
  readFile,
  openZip,
  getEntries,
  readTextEntry,
} from './file_reading';

export interface BallotPackage {
  electionDefinition: ElectionDefinition;
  // TODO(kevin) once all machines support system settings, make systemSettings required
  systemSettings?: SystemSettings;
  ballots: BallotPackageEntry[];
}

export interface BallotPackageEntry {
  pdf: Buffer;
  ballotConfig: BallotConfig;
  layout: readonly BallotPageLayout[];
}

export interface BallotPackageManifest {
  ballots: readonly BallotConfig[];
}

export interface BallotStyleData {
  ballotStyleId: BallotStyleId;
  contestIds: ContestId[];
  precinctId: PrecinctId;
}

export interface BallotConfig extends BallotStyleData {
  filename: string;
  layoutFilename: string;
  locales: BallotLocale;
  isLiveMode: boolean;
  isAbsentee: boolean;
}

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
    ballots: [],
  };
}

export async function readBallotPackageFromFile(
  file: File
): Promise<BallotPackage> {
  return readBallotPackageFromBuffer(await readFile(file));
}
