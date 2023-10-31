import _ from 'lodash';

import {
  BallotPackage,
  BallotPackageFileName,
  DEFAULT_SYSTEM_SETTINGS,
  UiStringAudioIdsPackage,
  UiStringAudioIdsPackageSchema,
  UiStringsPackage,
  UiStringsPackageSchema,
  safeParseElectionDefinitionExtended,
  safeParseJson,
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
import { extractCdfUiStrings } from './extract_cdf_ui_strings';

export async function readBallotPackageFromBuffer(
  source: Buffer
): Promise<BallotPackage> {
  const zipfile = await openZip(source);
  const zipName = 'ballot package';
  const entries = getEntries(zipfile);
  const electionEntry = getFileByName(
    entries,
    BallotPackageFileName.ELECTION,
    zipName
  );

  // System Settings:

  let systemSettingsData = JSON.stringify(DEFAULT_SYSTEM_SETTINGS);

  const systemSettingsEntry = maybeGetFileByName(
    entries,
    BallotPackageFileName.SYSTEM_SETTINGS
  );
  if (systemSettingsEntry) {
    systemSettingsData = await readTextEntry(systemSettingsEntry);
  }

  // Election Definition:

  const electionData = await readTextEntry(electionEntry);
  const { cdfElection, electionDefinition } =
    safeParseElectionDefinitionExtended(electionData).unsafeUnwrap();

  // UI Strings:

  const uiStrings: UiStringsPackage = {};
  const appStringsEntry = maybeGetFileByName(
    entries,
    BallotPackageFileName.APP_STRINGS
  );
  if (appStringsEntry) {
    const appStrings = safeParseJson(
      await readTextEntry(appStringsEntry),
      UiStringsPackageSchema
    ).unsafeUnwrap();

    _.merge(uiStrings, appStrings);
  }
  if (cdfElection) {
    const electionStrings = extractCdfUiStrings(cdfElection);
    _.merge(uiStrings, electionStrings);
  }

  // UI String Audio IDs:

  let uiStringAudioIds: UiStringAudioIdsPackage | undefined;
  const audioIdsEntry = maybeGetFileByName(
    entries,
    BallotPackageFileName.UI_STRING_AUDIO_IDS
  );
  if (audioIdsEntry) {
    uiStringAudioIds = safeParseJson(
      await readTextEntry(audioIdsEntry),
      UiStringAudioIdsPackageSchema
    ).unsafeUnwrap();
  }

  // TODO(kofi): Load metadata and audio clips from zip file.
  // TODO(kofi): Verify package version matches machine build version.

  return {
    electionDefinition,
    systemSettings: safeParseSystemSettings(systemSettingsData).unsafeUnwrap(),
    uiStrings,
    uiStringAudioIds,
  };
}

export async function readBallotPackageFromFile(
  file: File
): Promise<BallotPackage> {
  return readBallotPackageFromBuffer(await readFile(file));
}
