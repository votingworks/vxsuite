import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { assertDefined, DateWithoutTime } from '@votingworks/basics';
import type { ElectionInfoUpdate } from '@votingworks/election-definition-backend';
import {
  makeTemporaryDirectory,
  makeTemporaryFile,
} from '@votingworks/fixtures';
import {
  type District,
  LanguageCode,
  type NonEnglishLanguageCode,
} from '@votingworks/types';
import { createMockUsbDrive, type MockUsbDrive } from '@votingworks/usb-drive';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';
import { Store } from '../store.js';
import type { ElectionDefinitionStore } from './store.js';
import {
  exportTranslations,
  importTranslations,
  type TranslationsImportError,
} from './translations.js';

const ELECTION_ID = 'election-1';
const { SPANISH, CHINESE_SIMPLIFIED: CHINESE } = LanguageCode;

const ELECTION_INFO: ElectionInfoUpdate = {
  electionId: ELECTION_ID,
  type: 'general',
  date: new DateWithoutTime('2026-11-03'),
  title: 'General Election',
  state: 'State of Hamilton',
  jurisdictionName: 'Franklin County',
  seal: '<svg>seal</svg>',
  languageCodes: [LanguageCode.ENGLISH, SPANISH],
};

const DISTRICT: District = { id: 'district-1', name: 'District 1' };

interface CsvRow {
  ID: string;
  Context: string;
  English: string;
  Translation: string;
}

function setupStore(
  overrides: Partial<ElectionInfoUpdate> = {}
): ElectionDefinitionStore {
  const store = Store.memoryStore(makeTemporaryDirectory()).electionDefinition;
  const electionInfo: ElectionInfoUpdate = { ...ELECTION_INFO, ...overrides };
  store.createInProgressElection(electionInfo);
  store
    .updateDistricts({
      electionId: electionInfo.electionId,
      newDistricts: [DISTRICT],
    })
    .unsafeUnwrap();
  return store;
}

function setupUsbDrive(): MockUsbDrive {
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive({});
  mockUsbDrive.usbDrive.sync.expectRepeatedCallsWith().resolves();
  return mockUsbDrive;
}

async function exportCsv(
  store: ElectionDefinitionStore,
  usbDrive: MockUsbDrive,
  languageCode: NonEnglishLanguageCode = SPANISH
): Promise<{ filePath: string; raw: string; rows: CsvRow[] }> {
  const result = await exportTranslations(
    store,
    ELECTION_ID,
    usbDrive.usbDrive,
    languageCode
  );
  const filePath = assertDefined(result.unsafeUnwrap()[0]);
  const raw = readFileSync(filePath, 'utf8');
  const rows: CsvRow[] = parseCsv(raw, { bom: true, columns: true });
  return { filePath, raw, rows };
}

function writeCsv(rows: object[]): string {
  return makeTemporaryFile({
    content: stringifyCsv(rows, { header: true }),
  });
}

function withTranslations(
  rows: CsvRow[],
  translations: Record<string, string>
): CsvRow[] {
  return rows.map((row) => ({
    ...row,
    Translation: translations[row.ID] ?? row.Translation,
  }));
}

async function importCsv(
  store: ElectionDefinitionStore,
  filePath: string,
  languageCode: NonEnglishLanguageCode = SPANISH
) {
  return importTranslations(store, ELECTION_ID, filePath, languageCode);
}

function savedTranslations(
  store: ElectionDefinitionStore,
  languageCode: NonEnglishLanguageCode = SPANISH
): Map<string, string | undefined> {
  return new Map(
    store
      .getTranslations(ELECTION_ID, languageCode)
      .map((translation) => [translation.key, translation.translatedText])
  );
}

const JURISDICTION_ROW: CsvRow = {
  ID: 'jurisdictionName',
  Context: 'Jurisdiction Name',
  English: 'Franklin County',
  Translation: '',
};
const DISTRICT_ROW: CsvRow = {
  ID: 'districtName:district-1',
  Context: 'District Name',
  English: 'District 1',
  Translation: '',
};
const TITLE_ROW: CsvRow = {
  ID: 'electionTitle',
  Context: 'Election Title',
  English: 'General Election',
  Translation: '',
};
const STATE_ROW: CsvRow = {
  ID: 'stateName',
  Context: 'State Name',
  English: 'State of Hamilton',
  Translation: '',
};

describe('exportTranslations', () => {
  test('writes a BOM, a header, and a row per string with its context', async () => {
    const store = setupStore();
    const usbDrive = setupUsbDrive();

    const { filePath, raw, rows } = await exportCsv(store, usbDrive);

    expect(filePath).toMatch(/\/translations-es-US-election-1-.+\.csv$/);
    expect(raw.charCodeAt(0)).toEqual(0xfeff);
    expect(raw.slice(1).startsWith('ID,Context,English,Translation\n')).toEqual(
      true
    );
    expect(rows.slice(0, 4)).toEqual([
      JURISDICTION_ROW,
      DISTRICT_ROW,
      TITLE_ROW,
      STATE_ROW,
    ]);
    expect(rows[4]).toEqual({
      ID: 'hmpbOfficialBallot',
      Context: 'Ballot',
      English: 'Official Ballot',
      Translation: '',
    });
    expect(rows.find((row) => row.ID === 'number0')).toEqual({
      ID: 'number0',
      Context: 'VxSuite Interface',
      English: '0',
      Translation: '',
    });
    expect(rows.find((row) => row.ID === 'audioFeedbackRate75Percent')).toEqual(
      {
        ID: 'audioFeedbackRate75Percent',
        Context: 'VxSuite Interface',
        English: '75% speech rate',
        Translation: '',
      }
    );
    expect(rows.map((row) => row.ID)).not.toContain('electionDate');
  });

  test('preserves English with surrounding whitespace, quotes, commas, and newlines', async () => {
    const store = setupStore({
      title: ' General Election ',
      jurisdictionName: 'Franklin, "The Big" County\nEast',
      signatureImage: '<svg>signature</svg>',
      signatureCaption: 'Clerk',
    });
    const usbDrive = setupUsbDrive();

    const { rows, filePath } = await exportCsv(store, usbDrive);

    expect(rows[0]).toEqual({
      ...JURISDICTION_ROW,
      English: 'Franklin, "The Big" County\nEast',
    });
    expect(rows[2]).toEqual({ ...TITLE_ROW, English: ' General Election ' });
    expect((await importCsv(store, filePath)).ok()).toEqual(undefined);
  });
});

describe('importTranslations', () => {
  test('round trips translations through export, edit, and import', async () => {
    const store = setupStore();
    const usbDrive = setupUsbDrive();
    const { rows } = await exportCsv(store, usbDrive);

    const filePath = writeCsv(
      withTranslations(rows, {
        electionTitle: 'Elección General',
        'districtName:district-1': 'Distrito 1',
        number0: 'cero',
      })
    );
    expect((await importCsv(store, filePath)).ok()).toEqual(undefined);

    const { rows: exportedRows } = await exportCsv(store, usbDrive);
    expect(exportedRows.slice(0, 4)).toEqual([
      JURISDICTION_ROW,
      { ...DISTRICT_ROW, Translation: 'Distrito 1' },
      { ...TITLE_ROW, Translation: 'Elección General' },
      STATE_ROW,
    ]);
    expect(
      exportedRows.find((row) => row.ID === 'number0')?.Translation
    ).toEqual('cero');

    const saved = savedTranslations(store);
    expect(saved.size).toEqual(rows.length);
    expect(saved.get('electionTitle')).toEqual('Elección General');
    expect(saved.get('stateName')).toEqual(undefined);
  });

  test('accepts any header case, extra columns, and any column order', async () => {
    const store = setupStore();
    const usbDrive = setupUsbDrive();
    const { rows } = await exportCsv(store, usbDrive);

    const filePath = writeCsv(
      rows.map((row) => ({
        translation: row.ID === 'electionTitle' ? 'Elección General' : '',
        Notes: 'ignored',
        english: row.English,
        id: row.ID,
      }))
    );

    expect((await importCsv(store, filePath)).ok()).toEqual(undefined);
    expect(savedTranslations(store).get('electionTitle')).toEqual(
      'Elección General'
    );
  });

  test('trims translations and stores blank ones as missing', async () => {
    const store = setupStore();
    const usbDrive = setupUsbDrive();
    const { rows } = await exportCsv(store, usbDrive);

    const filePath = writeCsv(
      withTranslations(rows, {
        electionTitle: '   ',
        stateName: ' Estado de  Hamilton\n',
      })
    );
    expect((await importCsv(store, filePath)).ok()).toEqual(undefined);

    const saved = savedTranslations(store);
    expect(saved.get('electionTitle')).toEqual(undefined);
    expect(saved.get('stateName')).toEqual('Estado de  Hamilton');
  });

  const CONTENT_ERROR_CASES: Array<{
    name: string;
    content: string;
    error: TranslationsImportError;
  }> = [
    { name: 'a zero-byte file', content: '', error: { type: 'Empty' } },
    {
      name: 'a header-only file',
      content: 'ID,Context,English,Translation\n',
      error: { type: 'Empty' },
    },
    {
      name: 'a file missing one column',
      content: 'ID,Context,English\nelectionTitle,,General Election\n',
      error: { type: 'MissingColumns', columns: ['translation'] },
    },
    {
      name: 'a file missing two columns',
      content: 'ID,Context\nelectionTitle,\n',
      error: { type: 'MissingColumns', columns: ['english', 'translation'] },
    },
    {
      name: 'an unclosed quote',
      content: 'ID,Context,English,Translation\nelectionTitle,,"General,\n',
      error: {
        type: 'ParseError',
        error: expect.objectContaining({ code: 'CSV_QUOTE_NOT_CLOSED' }),
      },
    },
    {
      name: 'a short row',
      content: 'ID,Context,English,Translation\nelectionTitle,,General\n',
      error: {
        type: 'ParseError',
        error: expect.objectContaining({
          code: 'CSV_RECORD_INCONSISTENT_COLUMNS',
        }),
      },
    },
  ];

  test.each(CONTENT_ERROR_CASES)(
    'returns $error.type for $name',
    async ({ content, error }) => {
      const store = setupStore();

      const result = await importCsv(store, makeTemporaryFile({ content }));

      expect(result.err()).toEqual(error);
      expect(savedTranslations(store).size).toEqual(0);
    }
  );

  const ROW_ERROR_CASES: Array<{
    name: string;
    edit: (rows: CsvRow[]) => CsvRow[];
    error: TranslationsImportError;
  }> = [
    {
      name: 'an unknown ID',
      edit: (rows) => [
        { ...assertDefined(rows[0]), ID: 'contestTitle:no-such-contest' },
        ...rows.slice(1),
      ],
      error: { type: 'InvalidKey', key: 'contestTitle:no-such-contest' },
    },
    {
      name: 'a repeated ID',
      edit: (rows) => [...rows, assertDefined(rows[2])],
      error: { type: 'DuplicateKey', key: 'electionTitle' },
    },
    {
      name: 'changed English',
      edit: (rows) =>
        rows.map((row) =>
          row.ID === 'electionTitle'
            ? { ...row, English: 'General Election ' }
            : row
        ),
      error: { type: 'EnglishTextMismatch', key: 'electionTitle' },
    },
    {
      name: 'absent rows',
      edit: (rows) =>
        rows.filter((row) => row.ID !== 'stateName' && row.ID !== 'number0'),
      error: { type: 'MissingKeys', keys: ['stateName', 'number0'] },
    },
  ];

  test.each(ROW_ERROR_CASES)(
    'returns $error.type for $name and leaves saved translations untouched',
    async ({ edit, error }) => {
      const store = setupStore();
      const usbDrive = setupUsbDrive();
      const { rows } = await exportCsv(store, usbDrive);
      expect(
        (
          await importCsv(
            store,
            writeCsv(
              withTranslations(rows, { electionTitle: 'Elección General' })
            )
          )
        ).ok()
      ).toEqual(undefined);

      const result = await importCsv(
        store,
        writeCsv(edit(withTranslations(rows, { stateName: 'Estado' })))
      );

      expect(result.err()).toEqual(error);
      const saved = savedTranslations(store);
      expect(saved.get('electionTitle')).toEqual('Elección General');
      expect(saved.get('stateName')).toEqual(undefined);
    }
  );

  test('keeps languages independent', async () => {
    const store = setupStore({
      languageCodes: [LanguageCode.ENGLISH, SPANISH, CHINESE],
    });
    const usbDrive = setupUsbDrive();
    const { rows } = await exportCsv(store, usbDrive);

    expect(
      (
        await importCsv(
          store,
          writeCsv(
            withTranslations(rows, { electionTitle: 'Elección General' })
          )
        )
      ).ok()
    ).toEqual(undefined);

    expect(savedTranslations(store, CHINESE).size).toEqual(0);
    const { rows: chineseRows } = await exportCsv(store, usbDrive, CHINESE);
    expect(chineseRows[2]).toEqual(TITLE_ROW);
  });

  test('omits saved translations whose English has changed', async () => {
    const store = setupStore();
    const usbDrive = setupUsbDrive();
    const { rows } = await exportCsv(store, usbDrive);
    expect(
      (
        await importCsv(
          store,
          writeCsv(
            withTranslations(rows, {
              electionTitle: 'Elección General',
              stateName: 'Estado de Hamilton',
            })
          )
        )
      ).ok()
    ).toEqual(undefined);

    store.updateInProgressElectionInfo({
      ...ELECTION_INFO,
      title: 'Special Election',
    });

    const { rows: exportedRows } = await exportCsv(store, usbDrive);
    expect(exportedRows[2]).toEqual({
      ...TITLE_ROW,
      English: 'Special Election',
    });
    expect(exportedRows[3]).toEqual({
      ...STATE_ROW,
      Translation: 'Estado de Hamilton',
    });
  });

  test('replaces the saved rows for a language when a string is retired', async () => {
    const store = setupStore();
    const usbDrive = setupUsbDrive();
    const { rows } = await exportCsv(store, usbDrive);
    expect((await importCsv(store, writeCsv(rows))).ok()).toEqual(undefined);
    expect(savedTranslations(store).has('districtName:district-1')).toEqual(
      true
    );

    store
      .updateDistricts({
        electionId: ELECTION_ID,
        deletedDistrictIds: [DISTRICT.id],
      })
      .unsafeUnwrap();
    const { rows: rowsAfterDelete } = await exportCsv(store, usbDrive);
    expect(rowsAfterDelete).toHaveLength(rows.length - 1);
    expect((await importCsv(store, writeCsv(rowsAfterDelete))).ok()).toEqual(
      undefined
    );

    const saved = savedTranslations(store);
    expect(saved.size).toEqual(rows.length - 1);
    expect(saved.has('districtName:district-1')).toEqual(false);
  });

  test('deleting the election deletes its translations', async () => {
    const store = setupStore();
    const usbDrive = setupUsbDrive();
    const { rows } = await exportCsv(store, usbDrive);
    expect((await importCsv(store, writeCsv(rows))).ok()).toEqual(undefined);
    expect(savedTranslations(store).size).toEqual(rows.length);

    store.deleteInProgressElection();

    expect(savedTranslations(store).size).toEqual(0);
  });
});
