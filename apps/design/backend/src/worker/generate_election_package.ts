import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import JsZip from 'jszip';
import path from 'path';
import { pipeline } from 'stream/promises';
import { z } from 'zod';
import { assertDefined } from '@votingworks/basics';
import { layOutAllBallotStyles } from '@votingworks/hmpb-layout';
import {
  BallotType,
  Election,
  ElectionPackageFileName,
  ElectionStringKey,
  getDisplayElectionHash,
  Id,
  LanguageCode,
  safeParseJson,
  UiStringsPackage,
} from '@votingworks/types';
import { format } from '@votingworks/utils';

import { PORT } from '../globals';
import { GoogleCloudTranslator } from '../language_and_audio/translator';
import { WorkerContext } from './context';

async function translateAppStrings(
  translator: GoogleCloudTranslator
): Promise<UiStringsPackage> {
  const appStringsCatalogFileContents = await fs.readFile(
    path.join(
      __dirname,
      // TODO: Account for system version
      '../../../../../libs/ui/src/ui_strings/app_strings_catalog/latest.json'
    ),
    'utf-8'
  );
  const appStringsCatalog = safeParseJson(
    appStringsCatalogFileContents,
    z.record(z.string())
  ).unsafeUnwrap();

  const appStringKeys = Object.keys(appStringsCatalog).sort();
  const appStringsInEnglish = appStringKeys.map(
    (key) => appStringsCatalog[key]
  );

  const appStrings: UiStringsPackage = {};
  for (const languageCode of Object.values(LanguageCode)) {
    appStrings[languageCode] = {};
    const appStringsInLanguage =
      languageCode === LanguageCode.ENGLISH
        ? appStringsInEnglish
        : await translator.translateText(appStringsInEnglish, languageCode);
    for (const [i, key] of appStringKeys.entries()) {
      assertDefined(appStrings[languageCode])[key] = appStringsInLanguage[i];
    }
  }
  return appStrings;
}

function translateVxElectionStrings(election: Election): UiStringsPackage {
  const electionDate = new Date(election.date);
  const vxElectionStrings: UiStringsPackage = {};
  for (const languageCode of Object.values(LanguageCode)) {
    vxElectionStrings[languageCode] = {};
    const electionDateInLanguage = format.localeLongDate(
      electionDate,
      languageCode
    );
    assertDefined(vxElectionStrings[languageCode])[
      ElectionStringKey.ELECTION_DATE
    ] = electionDateInLanguage;
  }
  return vxElectionStrings;
}

export async function generateElectionPackage(
  { translator, workspace }: WorkerContext,
  { electionId }: { electionId: Id }
): Promise<void> {
  const { assetDirectoryPath, store } = workspace;

  const { election, layoutOptions, systemSettings, nhCustomContent } =
    store.getElection(electionId);

  const zip = new JsZip();

  const appStrings = await translateAppStrings(translator);
  zip.file(
    ElectionPackageFileName.APP_STRINGS,
    JSON.stringify(appStrings, null, 2)
  );

  const vxElectionStrings = translateVxElectionStrings(election);
  zip.file(
    ElectionPackageFileName.VX_ELECTION_STRINGS,
    JSON.stringify(vxElectionStrings, null, 2)
  );

  const { electionDefinition } = layOutAllBallotStyles({
    election,
    // Ballot type and ballot mode shouldn't change the election definition, so it doesn't matter
    // what we pass here
    ballotType: BallotType.Precinct,
    ballotMode: 'test',
    layoutOptions,
    nhCustomContent,
  }).unsafeUnwrap();
  zip.file(ElectionPackageFileName.ELECTION, electionDefinition.electionData);

  zip.file(
    ElectionPackageFileName.SYSTEM_SETTINGS,
    JSON.stringify(systemSettings, null, 2)
  );

  const displayElectionHash = getDisplayElectionHash(electionDefinition);
  const fileName = `election-package-${displayElectionHash}.zip`;
  const filePath = path.join(assetDirectoryPath, fileName);
  await pipeline(
    zip.generateNodeStream({ streamFiles: true }),
    createWriteStream(filePath)
  );
  store.setElectionPackageUrl({
    electionId,
    electionPackageUrl: `http://localhost:${PORT}/${fileName}`,
  });
}
