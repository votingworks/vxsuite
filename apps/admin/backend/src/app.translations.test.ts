import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { assertDefined, ok } from '@votingworks/basics';
import { makeTemporaryFile } from '@votingworks/fixtures';
import type * as grout from '@votingworks/grout';
import { LogEventId } from '@votingworks/logging';
import { type ElectionId, LanguageCode } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';
import type { ElectionDefinitionApi } from './election_definition/api.js';
import {
  attachUsbDrive,
  buildTestEnvironment,
  mockSystemAdministratorAuth,
} from '../test/app.js';

const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

const { SPANISH } = LanguageCode;

interface CsvRow {
  ID: string;
  Context: string;
  English: string;
  Translation: string;
}

beforeEach(() => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_ADMIN_ELECTION_DESIGN
  );
  vi.stubEnv('VX_MACHINE_JURISDICTION', 'vx.test');
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
  vi.unstubAllEnvs();
});

async function setupElection(
  electionDefinitionApiClient: grout.Client<ElectionDefinitionApi>
): Promise<ElectionId> {
  const electionId =
    await electionDefinitionApiClient.createInProgressElection();
  const electionInfo = await electionDefinitionApiClient.getElectionInfo({
    electionId,
  });
  (
    await electionDefinitionApiClient.updateElectionInfo({
      ...electionInfo,
      title: 'General Election',
      state: 'State of Hamilton',
      jurisdictionName: 'Franklin County',
      languageCodes: [LanguageCode.ENGLISH, SPANISH],
    })
  ).unsafeUnwrap();
  (
    await electionDefinitionApiClient.updateDistricts({
      electionId,
      newDistricts: [{ id: 'district-1', name: 'District 1' }],
    })
  ).unsafeUnwrap();
  return electionId;
}

function readCsv(filePath: string): CsvRow[] {
  return parseCsv(readFileSync(filePath, 'utf8'), {
    bom: true,
    columns: true,
  });
}

test('saves and loads a translations file', async () => {
  const { apiClient, electionDefinitionApiClient, auth, logger, usbPlatform } =
    buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await setupElection(electionDefinitionApiClient);
  await attachUsbDrive(apiClient, usbPlatform);

  const saveResult = await electionDefinitionApiClient.saveTranslationsFile({
    electionId,
    languageCode: SPANISH,
  });
  const [savedPath] = saveResult.unsafeUnwrap();
  expect(savedPath).toMatch(
    new RegExp(`/translations-es-US-${electionId}-.+\\.csv$`)
  );
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.TranslationsFileSaved,
    {
      message: `Saved es-US translations file for election definition ${electionId}.`,
      disposition: 'success',
    }
  );
  const rows = readCsv(assertDefined(savedPath));

  const filePath = makeTemporaryFile({
    content: stringifyCsv(
      rows.map((row) =>
        row.ID === 'electionTitle'
          ? { ...row, Translation: 'Elección General' }
          : row
      ),
      { header: true }
    ),
  });
  expect(
    await electionDefinitionApiClient.loadTranslationsFile({
      electionId,
      languageCode: SPANISH,
      filePath,
    })
  ).toEqual(ok());
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.TranslationsFileLoaded,
    {
      message: `Loaded es-US translations file for election definition ${electionId}.`,
      disposition: 'success',
    }
  );

  const [resavedPath] = (
    await electionDefinitionApiClient.saveTranslationsFile({
      electionId,
      languageCode: SPANISH,
    })
  ).unsafeUnwrap();
  expect(readCsv(assertDefined(resavedPath))[2]).toEqual({
    ID: 'electionTitle',
    Context: 'Election Title',
    English: 'General Election',
    Translation: 'Elección General',
  });
});

test('returns and logs save and load errors', async () => {
  const { electionDefinitionApiClient, auth, logger } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await setupElection(electionDefinitionApiClient);

  const saveResult = await electionDefinitionApiClient.saveTranslationsFile({
    electionId,
    languageCode: SPANISH,
  });
  expect(saveResult.err()?.type).toEqual('missing-usb-drive');
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.TranslationsFileSaved,
    {
      message: `Error saving es-US translations file for election definition ${electionId}: missing-usb-drive`,
      disposition: 'failure',
    }
  );

  const loadResult = await electionDefinitionApiClient.loadTranslationsFile({
    electionId,
    languageCode: SPANISH,
    filePath: '/nonexistent/translations.csv',
  });
  expect(loadResult.err()?.type).toEqual('OpenFileError');
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.TranslationsFileLoaded,
    {
      message: `Error loading es-US translations file for election definition ${electionId}: OpenFileError`,
      disposition: 'failure',
    }
  );
});
