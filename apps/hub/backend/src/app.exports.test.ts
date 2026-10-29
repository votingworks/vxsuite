import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';
import JsZip from 'jszip';
import { assert, assertDefined } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionSimpleSinglePrecinctFixtures,
  readElectionTwoPartyPrimaryDefinition,
  makeTemporaryFile,
  electionGridLayoutNewHampshireTestBallotFixtures,
} from '@votingworks/fixtures';
import {
  BallotType,
  DEFAULT_SYSTEM_SETTINGS,
  formatBallotHash,
  LATEST_SOFTWARE_VERSION,
} from '@votingworks/types';
import { getFeatureFlagMock } from '@votingworks/utils';
import { readElectionPackageFromBuffer } from '@votingworks/backend';
import {
  backendWaitFor,
  suppressingConsoleOutput,
} from '@votingworks/test-utils';
import {
  ballotTemplates,
  layOutBallots,
  createElectionDefinition,
  renderAllBallotPdfsAndCreateElectionDefinition,
  type ScratchDir,
} from '@votingworks/hmpb';
import path, { join } from 'node:path';
import { createSummaryBallotTestDeck } from '@votingworks/test-decks';
import {
  exportElectionPackage,
  exportTestDecks,
  getExportedFile,
  testSetupHelpers,
} from '../test/helpers.js';
import {
  FULL_TEST_DECK_TALLY_REPORT_FILE_NAME,
  createPrecinctTestDeck,
  createTestDeckTallyReports,
  precinctTallyReportFileName,
} from './test_decks.js';
import {
  organizations,
  jurisdictions,
  users,
  nonVxUser,
  nonVxJurisdiction,
  anotherNonVxUser,
  msJurisdiction,
} from '../test/mocks.js';

vi.setConfig({
  testTimeout: 120_000,
});

const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

vi.mock('./ballot_style_reports.js');

// Spy on the ballot rendering function so we can check that it's called with the
// right arguments.
vi.mock(import('@votingworks/hmpb'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    createElectionDefinition: vi.fn(original.createElectionDefinition),
    renderAllBallotPdfsAndCreateElectionDefinition: vi.fn(
      original.renderAllBallotPdfsAndCreateElectionDefinition
    ),
    layOutBallots: vi.fn(original.layOutBallots),
  } as unknown as typeof original;
});

// Mock decryption for ballotAuditIds
vi.mock('@votingworks/auth', async (importActual) => ({
  ...(await importActual()),
  decryptAes256: vi
    .fn()
    .mockImplementation((_key, data) => `decrypted-${data}`),
}));

// Spy on test deck functions so we can mock them in specific tests
vi.mock(import('./test_decks.js'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    createPrecinctTestDeck: vi.fn(original.createPrecinctTestDeck),
    createTestDeckTallyReports: vi.fn(original.createTestDeckTallyReports),
  };
});

vi.mock(import('@votingworks/test-decks'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    createSummaryBallotTestDeck: vi.fn(original.createSummaryBallotTestDeck),
  };
});

const ANY_SCRATCH_DIR: ScratchDir = { path: expect.any(String) };

const { setupApp, cleanup } = testSetupHelpers();

afterAll(cleanup);

beforeEach(() => {
  mockFeatureFlagger.resetFeatureFlags();
});

afterEach(() => {
  vi.mocked(renderAllBallotPdfsAndCreateElectionDefinition).mockRestore();
  vi.mocked(createPrecinctTestDeck).mockRestore();
  vi.mocked(createSummaryBallotTestDeck).mockRestore();
  vi.mocked(createTestDeckTallyReports).mockRestore();
});

test('Export test decks', async () => {
  const electionDefinition = readElectionTwoPartyPrimaryDefinition();
  const { apiClient, fileStorageClient, workspace, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id',
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: electionDefinition.electionData,
      },
    })
  ).unsafeUnwrap();

  const filename = await exportTestDecks({
    apiClient,
    electionId,
    fileStorageClient,
    workspace,
    electionSerializationFormat: 'vxf',
  });

  const filepath = join(nonVxJurisdiction.id, filename);
  const zipContents = assertDefined(
    fileStorageClient.getRawFile(filepath),
    `No file found in mock FileStorageClient for ${filepath}`
  );
  const zip = await JsZip.loadAsync(new Uint8Array(zipContents));

  const ballotStyles = await apiClient.listBallotStyles({ electionId });
  const precincts = await apiClient.listPrecincts({ electionId });
  const precinctsWithBallots = precincts.filter((precinct) =>
    ballotStyles.some((ballotStyle) =>
      ballotStyle.precincts.includes(precinct.id)
    )
  );
  // Default system settings have bmdPrintMode=bubble_ballot which does not include summary ballots
  expect(Object.keys(zip.files).sort()).toEqual(
    [
      ...precinctsWithBallots.flatMap((precinct) => [
        `${precinct.name.replaceAll(' ', '_')}-test-ballots.pdf`,
        `${precinct.name.replaceAll(' ', '_')}-test-deck-tally-report.pdf`,
      ]),
      FULL_TEST_DECK_TALLY_REPORT_FILE_NAME,
    ].sort()
  );

  // We test the actual test deck content in test_decks.ts
  for (const file of Object.values(zip.files)) {
    expect(await file.async('text')).toContain('%PDF');
  }
  const expectedBallotProps = ballotStyles.flatMap((ballotStyle) =>
    ballotStyle.precincts.map((precinctId) => ({
      election: expect.objectContaining({ id: electionId }),
      ballotStyleId: ballotStyle.id,
      precinctId,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
      compact: false,
    }))
  );
  expect(layOutBallots).toHaveBeenCalledExactlyOnceWith(
    expect.any(Object), // Renderer
    ballotTemplates.VxDefaultBallot,
    expectedBallotProps,
    ANY_SCRATCH_DIR,
    expect.any(Function) // emitProgress callback
  );

  const layoutRes = vi.mocked(layOutBallots).mock.settledResults[0];
  assert(layoutRes?.type === 'fulfilled');

  expect(createElectionDefinition).toHaveBeenCalledWith({
    ballotPositions: layoutRes.value.ballotPositions,
    baseElection: expect.objectContaining({ id: electionId }),
    scratchDir: ANY_SCRATCH_DIR,
    serializationOptions: { format: 'vxf', version: LATEST_SOFTWARE_VERSION },
    systemSettings: await apiClient.getSystemSettings({ electionId }),
    template: ballotTemplates.VxDefaultBallot,
  });

  await backendWaitFor(
    async () => {
      const testDecksTask = await apiClient.getTestDecks({ electionId });
      expect(testDecksTask.task!.progress).toEqual({
        label: 'Rendering test decks',
        progress: expect.any(Number),
        total: expect.any(Number),
      });
    },
    { interval: 1000, retries: 10 }
  );

  await suppressingConsoleOutput(async () => {
    // Check permissions
    auth0.setLoggedInUser(anotherNonVxUser);
    await expect(
      exportTestDecks({
        apiClient,
        electionId,
        fileStorageClient,
        workspace,
        electionSerializationFormat: 'vxf',
      })
    ).rejects.toThrow('auth:forbidden');
  });
});

test('split-file election: package export and test deck ballot hashes match', async () => {
  const ctx = await setupApp({ organizations, jurisdictions, users });
  ctx.auth0.setLoggedInUser(nonVxUser);

  const fixtures = electionGridLayoutNewHampshireTestBallotFixtures;
  const electionFileContents = fixtures.readElectionDefinition().electionData;

  const electionId = (
    await ctx.apiClient.loadElection({
      newId: 'new-election-id',
      jurisdictionId: nonVxJurisdiction.id,
      upload: { format: 'vxf', electionFileContents },
    })
  ).unsafeUnwrap();

  await ctx.apiClient.updateSystemSettings({
    electionId,
    systemSettings: {
      ...DEFAULT_SYSTEM_SETTINGS,
      splitElectionDefinition: true,
    },
  });

  const { officialBallotsUrl } = await exportElectionPackage({
    apiClient: ctx.apiClient,
    electionId,
    electionSerializationFormat: 'vxf',
    fileStorageClient: ctx.fileStorageClient,
    numAuditIdBallots: undefined,
    shouldExportAudio: false,
    shouldExportSampleBallots: false,
    shouldExportTestBallots: false,
    workspace: ctx.workspace,
  });

  const testDeckFileName = await exportTestDecks({
    apiClient: ctx.apiClient,
    electionId,
    electionSerializationFormat: 'vxf',
    fileStorageClient: ctx.fileStorageClient,
    workspace: ctx.workspace,
  });

  function hashFromPath(filePath: string) {
    const stem = path.basename(filePath, path.extname(filePath));
    assert(stem.length > 0);
    return stem.split('-').at(-1);
  }

  const officialHashPartial = hashFromPath(assertDefined(officialBallotsUrl));
  const testDeckHashPartial = hashFromPath(testDeckFileName);
  expect(testDeckHashPartial).toEqual(officialHashPartial);
});

test.each([
  { bmdPrintMode: undefined, shouldIncludeSummaryBallots: true },
  { bmdPrintMode: 'summary' as const, shouldIncludeSummaryBallots: true },
  {
    bmdPrintMode: 'bubble_ballot' as const,
    shouldIncludeSummaryBallots: false,
  },
  {
    bmdPrintMode: 'marks_on_preprinted_ballot' as const,
    shouldIncludeSummaryBallots: false,
  },
])(
  'bmdPrintMode=$bmdPrintMode should include summary ballots: $shouldIncludeSummaryBallots',
  async ({ bmdPrintMode, shouldIncludeSummaryBallots }) => {
    // Mock PDF rendering functions to return simple placeholder PDFs for faster test execution
    const mockPdfContent = new TextEncoder().encode('%PDF-mock');
    const pdfPath = makeTemporaryFile({ content: mockPdfContent });
    vi.mocked(createPrecinctTestDeck).mockImplementation(({ ballotSpecs }) =>
      Promise.resolve(ballotSpecs.length > 0 ? { pdfPath } : undefined)
    );
    vi.mocked(createSummaryBallotTestDeck).mockImplementation(
      ({ ballotSpecs }) =>
        Promise.resolve(ballotSpecs.length > 0 ? mockPdfContent : undefined)
    );
    vi.mocked(createTestDeckTallyReports).mockImplementation(
      ({ electionDefinition }) => {
        const { election } = electionDefinition;
        const reports = new Map<string, Uint8Array>();
        reports.set(FULL_TEST_DECK_TALLY_REPORT_FILE_NAME, mockPdfContent);
        for (const precinct of election.precincts) {
          reports.set(
            precinctTallyReportFileName(precinct.name),
            mockPdfContent
          );
        }
        return Promise.resolve(reports);
      }
    );

    const electionDefinition = readElectionTwoPartyPrimaryDefinition();
    const { apiClient, fileStorageClient, workspace, auth0 } = await setupApp({
      organizations,
      jurisdictions,
      users,
    });

    auth0.setLoggedInUser(nonVxUser);
    const electionId = (
      await apiClient.loadElection({
        newId: 'test-bmd-print-mode-election',
        jurisdictionId: nonVxJurisdiction.id,
        upload: {
          format: 'vxf',
          electionFileContents: electionDefinition.electionData,
        },
      })
    ).unsafeUnwrap();

    // Set the bmdPrintMode system setting
    await apiClient.updateSystemSettings({
      electionId,
      systemSettings: {
        ...DEFAULT_SYSTEM_SETTINGS,
        bmdPrintMode,
      },
    });

    const filename = await exportTestDecks({
      apiClient,
      electionId,
      fileStorageClient,
      workspace,
      electionSerializationFormat: 'vxf',
    });

    const filepath = join(nonVxJurisdiction.id, filename);
    const zipContents = assertDefined(
      fileStorageClient.getRawFile(filepath),
      `No file found in mock FileStorageClient for ${filepath}`
    );
    const zip = await JsZip.loadAsync(new Uint8Array(zipContents));

    const ballotStyles = await apiClient.listBallotStyles({ electionId });
    const precincts = await apiClient.listPrecincts({ electionId });
    const precinctsWithBallots = precincts.filter((precinct) =>
      ballotStyles.some((ballotStyle) =>
        ballotStyle.precincts.includes(precinct.id)
      )
    );

    const expectedFiles = shouldIncludeSummaryBallots
      ? [
          ...precinctsWithBallots.flatMap((precinct) => [
            `${precinct.name.replaceAll(' ', '_')}-test-ballots.pdf`,
            `${precinct.name.replaceAll(' ', '_')}-summary-ballots.pdf`,
          ]),
          FULL_TEST_DECK_TALLY_REPORT_FILE_NAME,
          ...precincts.map((precinct) =>
            precinctTallyReportFileName(precinct.name)
          ),
        ]
      : [
          ...precinctsWithBallots.map(
            (precinct) =>
              `${precinct.name.replaceAll(' ', '_')}-test-ballots.pdf`
          ),
          FULL_TEST_DECK_TALLY_REPORT_FILE_NAME,
          ...precincts.map((precinct) =>
            precinctTallyReportFileName(precinct.name)
          ),
        ];

    // eslint-disable-next-line vx/no-array-sort-mutation
    expect(Object.keys(zip.files).sort()).toEqual(expectedFiles.sort());
  }
);

test.each([
  {
    label: 'EDIT_POLLING_PLACES true (DEMO)',
    jurisdiction: nonVxJurisdiction,
    user: nonVxUser,
    fixture: electionFamousNames2021Fixtures,
  },
  {
    label: 'EDIT_POLLING_PLACES falsy (MS)',
    jurisdiction: msJurisdiction,
    user: anotherNonVxUser,
    fixture: electionSimpleSinglePrecinctFixtures,
  },
])(
  'Consistency of ballot hash across exports: $label',
  async ({ jurisdiction, user, fixture }) => {
    const baseElectionDefinition = fixture.readElectionDefinition();
    const { apiClient, workspace, fileStorageClient, auth0 } = await setupApp({
      organizations,
      jurisdictions,
      users,
    });

    auth0.setLoggedInUser(user);
    const electionId = (
      await apiClient.loadElection({
        newId: 'new-election-id',
        jurisdictionId: jurisdiction.id,
        upload: {
          format: 'vxf',
          electionFileContents: baseElectionDefinition.electionData,
        },
      })
    ).unsafeUnwrap();

    const testDecksFilePath = await exportTestDecks({
      fileStorageClient,
      apiClient,
      electionId,
      workspace,
      electionSerializationFormat: 'vxf',
    });

    const exportMeta = await exportElectionPackage({
      fileStorageClient,
      apiClient,
      electionId,
      workspace,
      electionSerializationFormat: 'vxf',
      shouldExportAudio: false,
      shouldExportSampleBallots: true,
      shouldExportTestBallots: false,
      numAuditIdBallots: undefined,
    });

    const electionPackageContents = getExportedFile({
      storage: fileStorageClient,
      jurisdictionId: jurisdiction.id,
      url: exportMeta.electionPackageUrl,
    });

    const { electionDefinition } = (
      await readElectionPackageFromBuffer(electionPackageContents)
    ).unsafeUnwrap().electionPackage;

    const electionPackageFileName = assertDefined(
      exportMeta.electionPackageUrl
    );
    const electionPackageZipBallotHash = electionPackageFileName.match(
      'election-package-(.*)-.*.zip'
    )![1];

    const ballotsFileName = assertDefined(exportMeta.officialBallotsUrl);
    const ballotsZipBallotHash = ballotsFileName.match(
      'official-ballots-(.*).zip'
    )![1];
    const testDecksBallotHash = testDecksFilePath.match(
      'test-decks-(.*).zip'
    )![1];

    // Test decks only report the shortened formatted version
    expect(formatBallotHash(electionDefinition.ballotHash)).toEqual(
      testDecksBallotHash
    );
    expect(electionPackageZipBallotHash).toEqual(ballotsZipBallotHash);
    expect(formatBallotHash(electionDefinition.ballotHash)).toEqual(
      electionPackageZipBallotHash
    );
  }
);

test('CDF exports', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { apiClient, workspace, fileStorageClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id',
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: baseElectionDefinition.electionData,
      },
    })
  ).unsafeUnwrap();

  const testDecksFilePath = await exportTestDecks({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'cdf',
  });

  const exportMeta = await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'cdf',
    shouldExportAudio: false,
    shouldExportSampleBallots: false,
    shouldExportTestBallots: true,
    numAuditIdBallots: undefined,
  });

  const electionPackageContents = getExportedFile({
    storage: fileStorageClient,
    jurisdictionId: nonVxJurisdiction.id,
    url: exportMeta.electionPackageUrl,
  });

  const { electionDefinition } = (
    await readElectionPackageFromBuffer(electionPackageContents)
  ).unsafeUnwrap().electionPackage;

  expect(electionDefinition.electionData).toMatch(
    /"@type": "BallotDefinition.BallotDefinition"/
  );

  const testDecksBallotHash = testDecksFilePath.match(
    'test-decks-(.*).zip'
  )![1];

  // Test decks only report the shortened formatted ballot hash
  expect(formatBallotHash(electionDefinition.ballotHash)).toEqual(
    testDecksBallotHash
  );
});
