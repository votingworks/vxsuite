import {
  type Election,
  type ElectionId,
  ElectionStringKey,
  hasSplits,
  type NonEnglishLanguageCode,
} from '@votingworks/types';
import type { UsbDrive } from '@votingworks/usb-drive';
import {
  assert,
  assertDefined,
  err,
  ok,
  throwIllegalValue,
  type Result,
} from '@votingworks/basics';
import { readFile, type ReadFileError } from '@votingworks/fs';
import { CsvError, parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';
import { generateFileTimeSuffix } from '@votingworks/utils';
import {
  type ElectionString,
  extractElectionStrings,
  type ExportDataResult,
  getElectionStringConfig,
} from '@votingworks/backend';
import { hmpbStringsCatalog } from '@votingworks/hmpb';
import { appStringsCatalog } from '@votingworks/ui';
import { buildExporter } from '../util/exporter.js';
import type { ElectionDefinitionStore } from './store.js';

/**
 * The translation for a string during election definition. The key is a
 * serialized string key (either "<key>" or "<key>:<subkey>").
 */
export interface TranslatedString {
  key: string;
  context: string;
  englishText: string;
  translatedText?: string;
}

const REQUIRED_COLUMNS = ['id', 'english', 'translation'] as const;

type TranslationsCsvRow = Record<(typeof REQUIRED_COLUMNS)[number], string>;

/**
 * Possible errors when importing a translations CSV file.
 */
export type TranslationsImportError =
  | ReadFileError
  | { type: 'ParseError'; error: CsvError }
  | { type: 'Empty' }
  | { type: 'MissingColumns'; columns: string[] }
  | { type: 'InvalidKey'; key: string }
  | { type: 'DuplicateKey'; key: string }
  | { type: 'MissingKeys'; keys: string[] }
  | { type: 'EnglishTextMismatch'; key: string };

const TRANSLATIONS_CSV_MAX_SIZE = 10_000_000; // 10 MB

function serializeStringKey(key: string | [string, string]): string {
  if (Array.isArray(key)) {
    return `${key[0]}:${key[1]}`;
  }
  return key;
}

const HMPB_STRING_CONTEXT = 'Ballot';
const APP_STRING_CONTEXT = 'VxSuite Interface';

const ELECTION_STRING_CONTEXTS: Record<ElectionStringKey, string> = {
  [ElectionStringKey.BALLOT_LANGUAGE]: 'Ballot Language',
  [ElectionStringKey.BALLOT_STYLE_ID]: 'Ballot Style ID',
  [ElectionStringKey.CANDIDATE_DESIGNATION]: 'Candidate Designation',
  [ElectionStringKey.CANDIDATE_NAME]: 'Candidate Name',
  [ElectionStringKey.CONTEST_DESCRIPTION]: 'Contest Description',
  [ElectionStringKey.CONTEST_OPTION_LABEL]: 'Contest Option',
  [ElectionStringKey.CONTEST_TERM]: 'Contest Term',
  [ElectionStringKey.CONTEST_TITLE]: 'Contest Title',
  [ElectionStringKey.DISTRICT_NAME]: 'District Name',
  [ElectionStringKey.ELECTION_DATE]: 'Election Date',
  [ElectionStringKey.ELECTION_TITLE]: 'Election Title',
  [ElectionStringKey.JURISDICTION_NAME]: 'Jurisdiction Name',
  [ElectionStringKey.PARTY_FULL_NAME]: 'Party Full Name',
  [ElectionStringKey.PARTY_NAME]: 'Party Short Name',
  [ElectionStringKey.POLLING_PLACE_NAME]: 'Polling Place Name',
  [ElectionStringKey.PRECINCT_NAME]: 'Precinct Name',
  [ElectionStringKey.PRECINCT_SPLIT_NAME]: 'Precinct Split Name',
  [ElectionStringKey.STATE_NAME]: 'State Name',
};

// @coverage-defer
function findParentName(
  election: Election,
  key: ElectionStringKey,
  subkey?: string
): string | undefined {
  switch (key) {
    case ElectionStringKey.CONTEST_DESCRIPTION:
    case ElectionStringKey.CONTEST_TERM:
      return assertDefined(
        election.contests.find((contest) => contest.id === subkey)
      ).title;
    case ElectionStringKey.CANDIDATE_DESIGNATION:
    case ElectionStringKey.CANDIDATE_NAME:
      return assertDefined(
        election.contests.find(
          (contest) =>
            contest.type === 'candidate' &&
            contest.candidates.some((candidate) => candidate.id === subkey)
        )
      ).title;
    case ElectionStringKey.CONTEST_OPTION_LABEL:
      return assertDefined(
        election.contests.find(
          (contest) =>
            contest.type === 'yesno' &&
            contest.options.some((option) => option.id === subkey)
        )
      ).title;
    case ElectionStringKey.PRECINCT_SPLIT_NAME:
      return assertDefined(
        election.precincts.find(
          (precinct) =>
            hasSplits(precinct) &&
            precinct.splits.some((split) => split.id === subkey)
        )
      ).name;
    case ElectionStringKey.BALLOT_LANGUAGE:
    case ElectionStringKey.BALLOT_STYLE_ID:
    case ElectionStringKey.CONTEST_TITLE:
    case ElectionStringKey.DISTRICT_NAME:
    case ElectionStringKey.ELECTION_DATE:
    case ElectionStringKey.ELECTION_TITLE:
    case ElectionStringKey.JURISDICTION_NAME:
    case ElectionStringKey.PARTY_FULL_NAME:
    case ElectionStringKey.PARTY_NAME:
    case ElectionStringKey.POLLING_PLACE_NAME:
    case ElectionStringKey.PRECINCT_NAME:
    case ElectionStringKey.STATE_NAME:
      return undefined;
    default:
      return throwIllegalValue(key);
  }
}

function electionStringContext(
  election: Election,
  stringKey: ElectionStringKey | [ElectionStringKey, string]
): string {
  const [key, subkey] =
    typeof stringKey === 'string' ? [stringKey, undefined] : stringKey;
  const label = ELECTION_STRING_CONTEXTS[key];
  const parentName = findParentName(election, key, subkey);
  // @coverage-defer
  return parentName ? `${label}: ${parentName}` : label;
}

function isTranslatable(
  electionString: ElectionString,
  languageCode: NonEnglishLanguageCode
): boolean {
  const config = getElectionStringConfig(electionString);
  return (
    config.translatable &&
    !config.customTranslationMethod &&
    (config.shouldTranslateByLanguage?.(languageCode, {}) ?? true)
  );
}

/**
 * Loads all strings for the given election and language code along with any
 * saved translations. Outdated translations are ommitted (if the English source
 * text has changed).
 */
function loadStringsAndTranslations(
  store: ElectionDefinitionStore,
  election: Election,
  languageCode: NonEnglishLanguageCode
): TranslatedString[] {
  const savedTranslations = new Map(
    store
      .getTranslations(election.id, languageCode)
      .map((translation) => [translation.key, translation])
  );

  const allStrings = [
    ...extractElectionStrings(election)
      .filter((electionString) => isTranslatable(electionString, languageCode))
      .map(({ stringKey, stringInEnglish }) => ({
        key: serializeStringKey(stringKey),
        context: electionStringContext(election, stringKey),
        englishText: stringInEnglish,
      })),
    ...Object.entries(hmpbStringsCatalog).map(([key, englishText]) => ({
      key,
      context: HMPB_STRING_CONTEXT,
      englishText,
    })),
    ...Object.entries(appStringsCatalog).map(([key, englishText]) => ({
      key,
      context: APP_STRING_CONTEXT,
      englishText,
    })),
  ];
  assert(
    new Set(allStrings.map((string) => string.key)).size === allStrings.length,
    'Duplicate string keys'
  );

  return allStrings.map((string) => {
    const savedTranslation = savedTranslations.get(string.key);
    return {
      ...string,
      // If the English source text has changed since the translation was saved,
      // omit the outdated translation.
      translatedText:
        savedTranslation?.englishText === string.englishText
          ? savedTranslation.translatedText
          : undefined,
    };
  });
}

/**
 * Loads the translations CSV from the given file path. Parses translations and
 * loads them into the store.
 */
export async function importTranslations(
  store: ElectionDefinitionStore,
  electionId: ElectionId,
  filePath: string,
  languageCode: NonEnglishLanguageCode
): Promise<Result<void, TranslationsImportError>> {
  const election = assertDefined(store.getElection(electionId));
  assert(
    assertDefined(store.getElectionInfo()).languageCodes.includes(languageCode),
    'Language not configured for election definition'
  );
  const file = await readFile(filePath, { maxSize: TRANSLATIONS_CSV_MAX_SIZE });
  if (file.isErr()) return file;

  let rows: Array<Record<string, string>>;
  try {
    rows = parseCsv(file.ok(), {
      bom: true,
      columns: (header: string[]) =>
        header.map((column) => column.toLowerCase()),
      skipEmptyLines: true,
    });
  } catch (error) {
    assert(error instanceof CsvError);
    return err({ type: 'ParseError', error });
  }

  const [firstRow] = rows;
  if (!firstRow) return err({ type: 'Empty' });
  const missingColumns = REQUIRED_COLUMNS.filter(
    (column) => !(column in firstRow)
  );
  if (missingColumns.length > 0) {
    return err({ type: 'MissingColumns', columns: missingColumns });
  }

  const savedTranslationsByKey = new Map(
    loadStringsAndTranslations(store, election, languageCode).map(
      (translation) => [translation.key, translation]
    )
  );

  const validRows = [];
  const seenKeys = new Set<string>();
  for (const row of rows as TranslationsCsvRow[]) {
    const savedTranslation = savedTranslationsByKey.get(row.id);
    if (!savedTranslation) {
      return err({ type: 'InvalidKey', key: row.id });
    }
    if (seenKeys.has(row.id)) {
      return err({ type: 'DuplicateKey', key: row.id });
    }
    seenKeys.add(row.id);
    if (savedTranslation.englishText !== row.english) {
      return err({ type: 'EnglishTextMismatch', key: row.id });
    }
    validRows.push({
      key: row.id,
      englishText: row.english,
      translatedText: row.translation.trim() || undefined,
    });
  }

  const missingKeys = [...savedTranslationsByKey.keys()].filter(
    (key) => !seenKeys.has(key)
  );
  if (missingKeys.length > 0) {
    return err({ type: 'MissingKeys', keys: missingKeys });
  }

  store.updateTranslations(election.id, languageCode, validRows);
  return ok();
}

/**
 * Exports translations from the store in CSV format to the given USB drive.
 */
export async function exportTranslations(
  store: ElectionDefinitionStore,
  electionId: ElectionId,
  usbDrive: UsbDrive,
  languageCode: NonEnglishLanguageCode
): Promise<ExportDataResult> {
  const election = assertDefined(store.getElection(electionId));
  assert(
    assertDefined(store.getElectionInfo()).languageCodes.includes(languageCode),
    'Language not configured for election definition'
  );
  const translationRows = loadStringsAndTranslations(
    store,
    election,
    languageCode
  ).map((translation) => ({
    ID: translation.key,
    Context: translation.context,
    English: translation.englishText,
    Translation: translation.translatedText,
  }));
  const csvContents = stringifyCsv(translationRows, {
    header: true,
    bom: true,
  });
  const exporter = buildExporter(usbDrive);
  const fileName = `translations-${languageCode}-${election.id}-${generateFileTimeSuffix()}.csv`;
  return exporter.exportDataToUsbDrive('', fileName, csvContents);
}
