import _ from 'lodash';

import {
  ElectionPackage,
  ElectionPackageFileName,
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

export async function readElectionPackageFromBuffer(
  source: Buffer
): Promise<ElectionPackage> {
  const zipfile = await openZip(source);
  const zipName = 'election package';
  const entries = getEntries(zipfile);
  const electionEntry = getFileByName(
    entries,
    ElectionPackageFileName.ELECTION,
    zipName
  );

  // System Settings:

  let systemSettingsData = JSON.stringify(DEFAULT_SYSTEM_SETTINGS);

  const systemSettingsEntry = maybeGetFileByName(
    entries,
    ElectionPackageFileName.SYSTEM_SETTINGS
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
    ElectionPackageFileName.APP_STRINGS
  );
  if (appStringsEntry) {
    const appStrings = safeParseJson(
      await readTextEntry(appStringsEntry),
      UiStringsPackageSchema
    ).unsafeUnwrap();

    _.merge(uiStrings, appStrings);
  }

  // Extract non-CDF election strings:
  const vxElectionStringsEntry = maybeGetFileByName(
    entries,
    ElectionPackageFileName.VX_ELECTION_STRINGS
  );
  if (vxElectionStringsEntry) {
    const vxElectionStrings = safeParseJson(
      await readTextEntry(vxElectionStringsEntry),
      UiStringsPackageSchema
    ).unsafeUnwrap();

    _.merge(uiStrings, vxElectionStrings);
  }

  if (cdfElection) {
    const electionStrings = extractCdfUiStrings(cdfElection);
    _.merge(uiStrings, electionStrings);
  }

  // UI String Audio IDs:

  let uiStringAudioIds: UiStringAudioIdsPackage | undefined;
  const audioIdsEntry = maybeGetFileByName(
    entries,
    ElectionPackageFileName.UI_STRING_AUDIO_IDS
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

export async function readElectionPackageFromFile(
  file: File
): Promise<ElectionPackage> {
  return readElectionPackageFromBuffer(await readFile(file));
}
