/* istanbul ignore file - DEMO */

import { Result, assert, err, ok, unique } from '@votingworks/basics';
import {
  ElectionStringKey,
  LanguageCode,
  TranslationEditKey,
} from '@votingworks/types';
import {
  Translator,
  extractElectionStrings,
  stripImagesFromRichText,
} from '@votingworks/backend';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { Workspace } from './workspace';

export interface BulkTranslationsApiContext {
  translator: Translator;
  workspace: Workspace;
}

// The election string categories a translation contractor can meaningfully
// edit. Excludes non-translatable keys (ballot style IDs, candidate names) and
// auto-computed keys (ballot language names, election date).
const TRANSLATABLE_STRING_KEYS: ElectionStringKey[] = [
  ElectionStringKey.CONTEST_DESCRIPTION,
  ElectionStringKey.CONTEST_OPTION_LABEL,
  ElectionStringKey.CONTEST_TERM,
  ElectionStringKey.CONTEST_TITLE,
  ElectionStringKey.DISTRICT_NAME,
  ElectionStringKey.ELECTION_TITLE,
  ElectionStringKey.JURISDICTION_NAME,
  ElectionStringKey.PARTY_FULL_NAME,
  ElectionStringKey.PARTY_NAME,
  ElectionStringKey.POLLING_PLACE_NAME,
  ElectionStringKey.PRECINCT_NAME,
  ElectionStringKey.PRECINCT_SPLIT_NAME,
  ElectionStringKey.STATE_NAME,
];

const COLUMN_ID = 'ID';
const COLUMN_ENGLISH = 'English';
const COLUMN_CURRENT = 'Current Translation';
const COLUMN_NEW = 'New Translation';
const CSV_COLUMNS = [
  COLUMN_ID,
  COLUMN_ENGLISH,
  COLUMN_CURRENT,
  COLUMN_NEW,
] as const;

function stringId(
  stringKey: ElectionStringKey | [ElectionStringKey, string]
): string {
  return typeof stringKey === 'string'
    ? stringKey
    : `${stringKey[0]}:${stringKey[1]}`;
}

export type BulkTranslationImportResult = Result<void, string>;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function apiMethods(ctx: BulkTranslationsApiContext) {
  return {
    async bulkTranslationExport(input: {
      electionId: string;
      language: LanguageCode;
    }): Promise<string> {
      assert(input.language !== LanguageCode.ENGLISH);
      const { election } = await ctx.workspace.store.getElection(
        input.electionId
      );
      const jurisdiction = await ctx.workspace.store.getElectionJurisdiction(
        input.electionId
      );

      const strings = extractElectionStrings(election, {
        include: TRANSLATABLE_STRING_KEYS,
      });

      const currentTranslations = await ctx.translator.translateText(
        strings.map((s) => s.stringInEnglish),
        input.language,
        jurisdiction.id
      );

      const rows = strings.map((s, i) => ({
        [COLUMN_ID]: stringId(s.stringKey),
        [COLUMN_ENGLISH]: s.stringInEnglish,
        [COLUMN_CURRENT]: currentTranslations[i] ?? '',
        [COLUMN_NEW]: '',
      }));

      return stringify(rows, { header: true, columns: [...CSV_COLUMNS] });
    },

    async bulkTranslationImport(input: {
      electionId: string;
      language: LanguageCode;
      csvContents: string;
    }): Promise<BulkTranslationImportResult> {
      const jurisdiction = await ctx.workspace.store.getElectionJurisdiction(
        input.electionId
      );

      let records: Array<Record<string, string>>;
      try {
        // Note: do NOT enable `trim` here. Edits are keyed by the English
        // source text, and the runtime translation lookup keys on the
        // untrimmed string, so the English column must stay byte-identical to
        // what was exported. The New Translation cell is trimmed explicitly
        // below.
        records = parse(input.csvContents, {
          columns: true,
          skip_empty_lines: true,
        });
      } catch (error) {
        return err(
          `Could not parse CSV file: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      if (records.length === 0) {
        return ok();
      }

      const header = Object.keys(records[0]);
      const missingColumns = CSV_COLUMNS.filter((c) => !header.includes(c));
      if (missingColumns.length > 0) {
        return err(
          `Missing expected columns: ${missingColumns.join(
            ', '
          )}. Make sure you are uploading a file downloaded from this page.`
        );
      }

      // Translations are keyed by English source text, so two rows with the
      // same English text must resolve to the same translation. An empty New
      // Translation resets that string to its auto-generated translation.
      const translationsByEnglish = new Map<string, string>();
      const conflicts: string[] = [];
      for (const record of records) {
        const englishText = stripImagesFromRichText(
          record[COLUMN_ENGLISH] ?? ''
        );
        if (!englishText) continue;

        const newTranslation = (record[COLUMN_NEW] ?? '').trim();
        const existing = translationsByEnglish.get(englishText);
        if (existing !== undefined && existing !== newTranslation) {
          conflicts.push(record[COLUMN_ENGLISH] ?? '');
          continue;
        }
        translationsByEnglish.set(englishText, newTranslation);
      }

      if (conflicts.length > 0) {
        const conflictList = unique(conflicts)
          .map((english) => `- "${english}"`)
          .join('\n');
        return err(
          `Conflicting translations found. The same English source text was given different translations. Each occurrence of an identical English string must have the same translation.\n${conflictList}`
        );
      }

      for (const [englishText, text] of translationsByEnglish) {
        const editKey: TranslationEditKey = {
          jurisdictionId: jurisdiction.id,
          languageCode: input.language,
          englishText,
        };
        if (text) {
          await ctx.workspace.store.translationEditsSet(editKey, text);
        } else {
          // Empty translation: reset to the auto-generated translation by
          // removing any existing manual edit.
          await ctx.workspace.store.translationEditsDelete(editKey);
        }
      }

      await ctx.workspace.store.bulkTranslationUploadRecord(
        input.electionId,
        input.language
      );

      return ok();
    },

    async bulkTranslationClear(input: {
      electionId: string;
      language: LanguageCode;
    }): Promise<void> {
      const { election } = await ctx.workspace.store.getElection(
        input.electionId
      );
      const jurisdiction = await ctx.workspace.store.getElectionJurisdiction(
        input.electionId
      );

      const strings = extractElectionStrings(election, {
        include: TRANSLATABLE_STRING_KEYS,
      });

      const englishTexts = new Set(
        strings.map((s) => stripImagesFromRichText(s.stringInEnglish))
      );
      for (const englishText of englishTexts) {
        await ctx.workspace.store.translationEditsDelete({
          jurisdictionId: jurisdiction.id,
          languageCode: input.language,
          englishText,
        });
      }

      await ctx.workspace.store.bulkTranslationUploadClear(
        input.electionId,
        input.language
      );
    },

    bulkTranslationUploadsGet(input: {
      electionId: string;
    }): Promise<Array<{ languageCode: string; uploadedAt: string }>> {
      return ctx.workspace.store.bulkTranslationUploadsGet(input.electionId);
    },
  };
}
