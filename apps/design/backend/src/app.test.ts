import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import JsZip from 'jszip';
import get from 'lodash.get';
import {
  DateWithoutTime,
  Result,
  assert,
  assertDefined,
  deferred,
  err,
  find,
  ok,
  range,
} from '@votingworks/basics';
import { readFileSync } from 'node:fs';
import {
  electionFamousNames2021Fixtures,
  electionPrimaryPrecinctSplitsFixtures,
  makeTemporaryPath,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import {
  BallotMode,
  BaseBallotProps,
  AdjudicationReason,
  HmpbBallotPaperSize,
  BallotType,
  CandidateContest,
  DEFAULT_SYSTEM_SETTINGS,
  Election,
  ElectionStringKey,
  SystemSettings,
  UiStringsPackage,
  formatBallotHash,
  formatElectionPackageHash,
  mergeUiStrings,
  LanguageCode,
  unsafeParse,
  ElectionIdSchema,
  DistrictIdSchema,
  ElectionId,
  Precinct,
  hasSplits,
  PrecinctWithSplits,
  PrecinctWithoutSplits,
  District,
  Party,
  PartyIdSchema,
  YesNoContest,
  PartyId,
  DistrictId,
  CastVoteRecordExportFileName,
  BALLOT_MODES,
  safeParseJson,
} from '@votingworks/types';
import {
  ballotStyleHasPrecinctOrSplit,
  BooleanEnvironmentVariableName,
  getEntries,
  getFeatureFlagMock,
  getFileByName,
  openZip,
} from '@votingworks/utils';
import {
  execFile,
  forEachUiString,
  isMockCloudSynthesizedSpeech,
  mockCloudTranslatedText,
  readCastVoteRecordExport,
  readElectionPackageFromBuffer,
} from '@votingworks/backend';
import {
  backendWaitFor,
  countObjectLeaves,
  getObjectLeaves,
  suppressingConsoleOutput,
} from '@votingworks/test-utils';
import {
  allBaseBallotProps,
  ballotTemplates,
  hmpbStringsCatalog,
  layOutBallotsAndCreateElectionDefinition,
  renderAllBallotPdfsAndCreateElectionDefinition,
} from '@votingworks/hmpb';
import {
  ELECTION_PACKAGE_FILE_NAME_REGEX,
  exportElectionPackage,
  exportTestDecks,
  generateAllPrecinctsTallyReport,
  getExportedFile,
  processNextBackgroundTaskIfAny,
  readFixture,
  testSetupHelpers,
} from '../test/helpers';
import {
  FULL_TEST_DECK_TALLY_REPORT_FILE_NAME,
  createPrecinctTestDeck,
  createPrecinctSummaryBallotTestDeck,
  createTestDeckTallyReports,
  precinctTallyReportFileName,
} from './test_decks';
import {
  ElectionInfo,
  ElectionListing,
  ElectionStatus,
  Jurisdiction,
} from './types';
import { generateBallotStyles } from '@votingworks/hmpb';
import {
  MainExportTaskMetadata,
  DuplicateDistrictError,
  DuplicatePartyError,
  TestDecksTaskMetadata,
} from './store';
import path, { join } from 'node:path';
import { stateFeatureConfigs, userFeatureConfigs } from './features';
import { LogEventId } from '@votingworks/logging';
import { buildApi } from './app';
import { readdir, readFile } from 'node:fs/promises';
import {
  organizations,
  jurisdictions,
  users,
  vxUser,
  nonVxUser,
  nonVxJurisdiction,
  vxJurisdiction,
  anotherNonVxUser,
  anotherNonVxJurisdiction,
  sliJurisdiction,
  sliUser,
  nhJurisdiction,
  msJurisdiction,
  nonVxOrganizationUser,
  supportUser,
} from '../test/mocks';
import {
  SLI_DEFAULT_SYSTEM_SETTINGS,
  stateDefaultSystemSettings,
} from './system_settings';
import {
  GenerateElectionPackageAndBallotsPayload,
  GenerateElectionPackageAndBallotsPayloadSchema,
} from './worker/generate_election_package_and_ballots';
import {
  GenerateTestDecksPayload,
  GenerateTestDecksPayloadSchema,
} from './worker/generate_test_decks';

vi.setConfig({
  testTimeout: 120_000,
});

function expectNotEqualTo(str: string) {
  return expect.not.stringMatching(new RegExp(`^${str}$`));
}

function compareName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name);
}

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
    renderAllBallotPdfsAndCreateElectionDefinition: vi.fn(
      original.renderAllBallotPdfsAndCreateElectionDefinition
    ),
    layOutBallotsAndCreateElectionDefinition: vi.fn(
      original.layOutBallotsAndCreateElectionDefinition
    ),
  } as unknown as typeof original;
});

// Mock decryption for ballotAuditIds
vi.mock('@votingworks/auth', async (importActual) => {
  return {
    ...(await importActual()),
    decryptAes256: vi
      .fn()
      .mockImplementation((_key, data) => `decrypted-${data}`),
  };
});

// Spy on test deck functions so we can mock them in specific tests
vi.mock(import('./test_decks.js'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    createPrecinctTestDeck: vi.fn(original.createPrecinctTestDeck),
    createPrecinctSummaryBallotTestDeck: vi.fn(
      original.createPrecinctSummaryBallotTestDeck
    ),
    createTestDeckTallyReports: vi.fn(original.createTestDeckTallyReports),
  };
});

const { setupApp, cleanup } = testSetupHelpers();

const MOCK_READINESS_REPORT_CONTENTS = '%PDF - MockReadinessReport';

function expectedEnglishBallotStrings(election: Election): UiStringsPackage {
  const expectedStrings = mergeUiStrings(election.ballotStrings, {
    [LanguageCode.ENGLISH]: hmpbStringsCatalog,
  });
  return {
    ...expectedStrings,
    [LanguageCode.ENGLISH]: {
      ...expectedStrings[LanguageCode.ENGLISH],
      ballotStyleId: Object.fromEntries(
        election.ballotStyles.map(({ id, groupId }) => [id, groupId])
      ),
      districtName: Object.fromEntries(
        election.districts.map(({ id, name }) => [id, name])
      ),
      precinctName: Object.fromEntries(
        election.precincts.map(({ id, name }) => [id, name])
      ),
      partyName: Object.fromEntries(
        election.parties.map(({ id, name }) => [id, name])
      ),
      partyFullName: Object.fromEntries(
        election.parties.map(({ id, fullName }) => [id, fullName])
      ),
      contestTitle: Object.fromEntries(
        election.contests.map(({ id, title }) => [id, title])
      ),
      candidateName: Object.fromEntries(
        election.contests
          .filter(
            (contest): contest is CandidateContest =>
              contest.type === 'candidate'
          )
          .flatMap((contest) =>
            contest.candidates.map(({ id, name }) => [id, name])
          )
      ),
    },
  };
}

afterAll(cleanup);

beforeEach(() => {
  mockFeatureFlagger.resetFeatureFlags();
});

afterEach(() => {
  vi.mocked(renderAllBallotPdfsAndCreateElectionDefinition).mockRestore();
  vi.mocked(createPrecinctTestDeck).mockRestore();
  vi.mocked(createPrecinctSummaryBallotTestDeck).mockRestore();
  vi.mocked(createTestDeckTallyReports).mockRestore();
});

test('all methods require authentication', async () => {
  const { apiClient, baseUrl, ...context } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  await suppressingConsoleOutput(async () => {
    const apiMethodNames = Object.keys(buildApi(context).methods());
    for (const apiMethodName of apiMethodNames) {
      // @ts-ignore - Don't pass any input to the API methods since we expect
      // auth middleware to reject it before getting to the handler. A bit of a
      // hack, but lets us test all the methods quickly without constructing
      // bespoke input for each one.
      await expect(apiClient[apiMethodName]()).rejects.toThrow(
        'auth:unauthorized'
      );
    }

    // Special case for the /files endpoint, which doesn't go through the Grout API
    const response = await fetch(
      `${baseUrl}/files/some-jurisdiction-id/some-file-path`
    );
    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ message: 'auth:unauthorized' });
  });
});

test('create/list/delete elections', async () => {
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nonVxUser);
  expect(await apiClient.listElections()).toEqual([]);

  const expectedNonVxElectionId = unsafeParse(ElectionIdSchema, 'election-1');
  const nonVxElectionId = (
    await apiClient.createElection({
      id: expectedNonVxElectionId,
      jurisdictionId: nonVxJurisdiction.id,
    })
  ).unsafeUnwrap();
  expect(nonVxElectionId).toEqual(expectedNonVxElectionId);

  const expectedNonVxElectionListing: ElectionListing = {
    jurisdictionId: nonVxJurisdiction.id,
    jurisdictionName: nonVxJurisdiction.name,
    electionId: expectedNonVxElectionId,
    title: '',
    date: DateWithoutTime.today(),
    type: 'general',
    countyName: nonVxJurisdiction.name,
    state: 'DEMO',
    status: 'notStarted',
  };

  auth0.setLoggedInUser(nonVxOrganizationUser);
  const expectedNonVxElectionId2 = unsafeParse(ElectionIdSchema, 'election-2');
  const nonVxElectionId2 = (
    await apiClient.createElection({
      id: expectedNonVxElectionId2,
      jurisdictionId: anotherNonVxJurisdiction.id,
    })
  ).unsafeUnwrap();
  expect(nonVxElectionId2).toEqual(expectedNonVxElectionId2);

  const expectedNonVxElectionListing2: ElectionListing = {
    ...expectedNonVxElectionListing,
    jurisdictionId: anotherNonVxJurisdiction.id,
    jurisdictionName: anotherNonVxJurisdiction.name,
    electionId: expectedNonVxElectionId2,
    countyName: anotherNonVxJurisdiction.name,
  };

  // Jurisdiction user should only see elections in their jurisdictions
  auth0.setLoggedInUser(nonVxUser);
  expect(await apiClient.listElections()).toEqual([
    expectedNonVxElectionListing,
  ]);
  auth0.setLoggedInUser(anotherNonVxUser);
  expect(await apiClient.listElections()).toEqual([
    expectedNonVxElectionListing2,
  ]);
  // Organization user should see elections in all jurisdictions in the organization
  auth0.setLoggedInUser(nonVxOrganizationUser);
  expect(await apiClient.listElections()).toEqual([
    expectedNonVxElectionListing2,
    expectedNonVxElectionListing,
  ]);

  const sliElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const sliElection = sliElectionDefinition.election;

  // Support user can load elections into any organization/jurisdiction
  auth0.setLoggedInUser(supportUser);
  const importedElectionNewId = 'new-election-id' as ElectionId;
  const sliElectionId = (
    await apiClient.loadElection({
      newId: importedElectionNewId,
      jurisdictionId: sliJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: sliElectionDefinition.electionData,
      },
    })
  ).unsafeUnwrap();
  expect(sliElectionId).toEqual(importedElectionNewId);

  const expectedSliElectionListing: ElectionListing = {
    jurisdictionId: sliJurisdiction.id,
    jurisdictionName: sliJurisdiction.name,
    electionId: importedElectionNewId,
    title: sliElection.title,
    date: sliElection.date,
    type: sliElection.type,
    countyName: sliElection.county.name,
    state: sliElection.state,
    status: 'inProgress',
  };

  // Support user should have access to all elections
  expect(await apiClient.listElections()).toEqual([
    expectedSliElectionListing,
    expectedNonVxElectionListing2,
    expectedNonVxElectionListing,
  ]);

  // Permissions should restrict jurisdiction users accessing elections outside their jurisdictions
  auth0.setLoggedInUser(anotherNonVxUser);
  await suppressingConsoleOutput(async () => {
    await expect(
      apiClient.createElection({
        id: 'id',
        jurisdictionId: nonVxJurisdiction.id,
      })
    ).rejects.toThrow('auth:forbidden');
    await expect(
      apiClient.deleteElection({ electionId: nonVxElectionId })
    ).rejects.toThrow('auth:forbidden');
  });

  // Permissions should restrict accessing elections across organizations
  auth0.setLoggedInUser(nonVxUser);
  await suppressingConsoleOutput(async () => {
    await expect(
      apiClient.createElection({ id: 'id', jurisdictionId: vxJurisdiction.id })
    ).rejects.toThrow('auth:forbidden');
    await expect(
      apiClient.deleteElection({ electionId: importedElectionNewId })
    ).rejects.toThrow('auth:forbidden');
  });
  auth0.setLoggedInUser(nonVxOrganizationUser);
  await suppressingConsoleOutput(async () => {
    await expect(
      apiClient.createElection({ id: 'id', jurisdictionId: vxJurisdiction.id })
    ).rejects.toThrow('auth:forbidden');
    await expect(
      apiClient.deleteElection({ electionId: importedElectionNewId })
    ).rejects.toThrow('auth:forbidden');
  });

  // Support user can delete elections in any organization/jurisdiction
  auth0.setLoggedInUser(supportUser);
  await apiClient.deleteElection({ electionId: nonVxElectionId });
  expect(await apiClient.listElections()).toEqual([
    expectedSliElectionListing,
    expectedNonVxElectionListing2,
  ]);

  // Check that election was loaded correctly
  expect(
    await apiClient.getElectionInfo({ electionId: sliElectionId })
  ).toEqual<ElectionInfo>({
    jurisdictionId: sliJurisdiction.id,
    electionId: importedElectionNewId,
    title: sliElection.title,
    countyName: sliElection.county.name,
    date: sliElection.date,
    languageCodes: [LanguageCode.ENGLISH],
    state: sliElection.state,
    seal: sliElection.seal,
    type: sliElection.type,
  });
  const election2Districts = await apiClient.listDistricts({
    electionId: sliElectionId,
  });
  expect(election2Districts).toEqual(
    sliElection.districts.map((district) => ({
      ...district,
      id: expectNotEqualTo(district.id),
    }))
  );
  const election2Precincts = await apiClient.listPrecincts({
    electionId: sliElectionId,
  });
  expect(election2Precincts).toEqual(
    sliElection.precincts.toSorted(compareName).map((precinct) => ({
      id: expectNotEqualTo(precinct.id),
      name: precinct.name,
      districtIds: [election2Districts[0].id],
    }))
  );
  const election2Parties = await apiClient.listParties({
    electionId: sliElectionId,
  });
  expect(election2Parties).toEqual(
    sliElection.parties.toSorted(compareName).map((party) => ({
      ...party,
      id: expectNotEqualTo(party.id),
    }))
  );
  const election2Contests = await apiClient.listContests({
    electionId: sliElectionId,
  });
  function updatedPartyId(originalPartyId: PartyId) {
    const originalParty = find(
      sliElection.parties,
      (party) => party.id === originalPartyId
    );
    return find(election2Parties, (party) => party.name === originalParty.name)
      .id;
  }
  expect(election2Contests).toEqual(
    sliElection.contests.map((contest) => ({
      ...contest,
      id: expectNotEqualTo(contest.id),
      districtId: election2Districts[0].id,
      ...(contest.type === 'candidate'
        ? {
            candidates: contest.candidates.map((candidate) =>
              expect.objectContaining({
                ...candidate,
                id: expectNotEqualTo(candidate.id),
                partyIds: candidate.partyIds?.map(updatedPartyId).sort(),
                firstName: expect.any(String),
                // TODO upgrade vitest to use expect.toBeOneOf
                // middleName: expect.toBeOneOf([expect.any(String), undefined]),
                lastName: expect.any(String),
              })
            ),
          }
        : {
            yesOption: {
              ...contest.yesOption,
              id: expectNotEqualTo(contest.yesOption.id),
            },
            noOption: {
              ...contest.noOption,
              id: expectNotEqualTo(contest.noOption.id),
            },
          }),
    }))
  );
  expect(
    await apiClient.listBallotStyles({ electionId: sliElectionId })
  ).toEqual(
    generateBallotStyles({
      ballotLanguageConfigs: [{ languages: [LanguageCode.ENGLISH] }],
      contests: election2Contests,
      electionType: sliElection.type,
      parties: election2Parties,
      precincts: [...election2Precincts],
      ballotTemplateId: 'VxDefaultBallot',
      electionId: sliElectionId,
    })
  );
  expect(
    await apiClient.getBallotLayoutSettings({ electionId: sliElectionId })
  ).toEqual({
    paperSize: sliElection.ballotLayout.paperSize,
    compact: false,
  });
  expect(
    await apiClient.getSystemSettings({ electionId: sliElectionId })
  ).toEqual(SLI_DEFAULT_SYSTEM_SETTINGS);
  expect(
    await apiClient.getBallotTemplate({ electionId: sliElectionId })
  ).toEqual('VxDefaultBallot');
  expect(
    await apiClient.getBallotsFinalizedAt({ electionId: sliElectionId })
  ).toEqual(null);

  // Finalize ballots and check status
  await apiClient.finalizeBallots({ electionId: sliElectionId });
  expect((await apiClient.listElections())[0].status).toEqual<ElectionStatus>(
    'ballotsFinalized'
  );

  await apiClient.approveBallots({ electionId: sliElectionId });
  expect((await apiClient.listElections())[0].status).toEqual<ElectionStatus>(
    'ballotsApproved'
  );

  // Loading election with an existing title+date should add copy prefix to the title
  const duplicateElectionId = (
    await apiClient.loadElection({
      newId: unsafeParse(ElectionIdSchema, 'duplicate-election-id'),
      jurisdictionId: sliJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: sliElectionDefinition.electionData,
      },
    })
  ).unsafeUnwrap();
  const duplicateElection = await apiClient.getElectionInfo({
    electionId: duplicateElectionId,
  });
  expect(duplicateElection.title).toEqual(
    `(Copy) ${sliElectionDefinition.election.title}`
  );
  const duplicateElectionId2 = (
    await apiClient.loadElection({
      newId: unsafeParse(ElectionIdSchema, 'duplicate-election-id-2'),
      jurisdictionId: sliJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: sliElectionDefinition.electionData,
      },
    })
  ).unsafeUnwrap();
  const duplicateElection2 = await apiClient.getElectionInfo({
    electionId: duplicateElectionId2,
  });
  expect(duplicateElection2.title).toEqual(
    `(Copy 2) ${sliElectionDefinition.election.title}`
  );
  const duplicateElectionId3 = (
    await apiClient.loadElection({
      newId: unsafeParse(ElectionIdSchema, 'duplicate-election-id-3'),
      jurisdictionId: sliJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: sliElectionDefinition.electionData,
      },
    })
  ).unsafeUnwrap();
  const duplicateElection3 = await apiClient.getElectionInfo({
    electionId: duplicateElectionId3,
  });
  expect(duplicateElection3.title).toEqual(
    `(Copy 3) ${sliElectionDefinition.election.title}`
  );

  // Creating a two blank elections with empty titles is allowed
  const blankElectionId = (
    await apiClient.createElection({
      id: unsafeParse(ElectionIdSchema, 'blank-election-id'),
      jurisdictionId: nonVxJurisdiction.id,
    })
  ).unsafeUnwrap();
  const blankElection = await apiClient.getElectionInfo({
    electionId: blankElectionId,
  });
  expect(blankElection.title).toEqual('');
  const duplicateBlankElectionId = (
    await apiClient.createElection({
      id: unsafeParse(ElectionIdSchema, 'duplicate-blank-election-id'),
      jurisdictionId: nonVxJurisdiction.id,
    })
  ).unsafeUnwrap();
  const duplicateBlankElection = await apiClient.getElectionInfo({
    electionId: duplicateBlankElectionId,
  });
  expect(duplicateBlankElection.date).toEqual(blankElection.date);
  expect(duplicateBlankElection.title).toEqual(blankElection.title);
});

test('update election info', async () => {
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);

  const electionId = unsafeParse(ElectionIdSchema, 'election-1');
  (
    await apiClient.createElection({
      jurisdictionId: nonVxJurisdiction.id,
      id: electionId,
    })
  ).unsafeUnwrap();

  // Default election info should be blank with some default values
  expect(await apiClient.getElectionInfo({ electionId })).toEqual<ElectionInfo>(
    {
      jurisdictionId: nonVxJurisdiction.id,
      electionId,
      title: '',
      countyName: nonVxJurisdiction.name,
      state: nonVxJurisdiction.stateCode,
      seal: '',
      type: 'general',
      date: DateWithoutTime.today(),
      languageCodes: [LanguageCode.ENGLISH],
    }
  );

  // Update election info
  const electionInfoUpdate: ElectionInfo = {
    jurisdictionId: nonVxJurisdiction.id,
    electionId,
    // trim text values
    title: '   Updated Election  ',
    countyName: '   New Hampshire   ',
    state: '   NH   ',
    seal: '\r\n<svg>updated seal</svg>\r\n',
    type: 'primary',
    date: new DateWithoutTime('2022-01-01'),
    languageCodes: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
  };
  await apiClient.updateElectionInfo(electionInfoUpdate);
  expect(await apiClient.getElectionInfo({ electionId })).toEqual<ElectionInfo>(
    {
      jurisdictionId: nonVxJurisdiction.id,
      electionId,
      title: 'Updated Election',
      countyName: 'New Hampshire',
      state: 'NH',
      seal: '\r\n<svg>updated seal</svg>\r\n',
      type: 'primary',
      date: new DateWithoutTime('2022-01-01'),
      languageCodes: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
    }
  );

  // Change to NhBallot to test signature behavior
  await apiClient.setBallotTemplate({
    electionId,
    ballotTemplateId: 'NhBallot',
  });

  // Election info should be unchanged at first
  expect(await apiClient.getElectionInfo({ electionId })).toEqual<ElectionInfo>(
    {
      jurisdictionId: nonVxJurisdiction.id,
      electionId,
      title: 'Updated Election',
      countyName: 'New Hampshire',
      state: 'NH',
      seal: '\r\n<svg>updated seal</svg>\r\n',
      type: 'primary',
      date: new DateWithoutTime('2022-01-01'),
      languageCodes: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
    }
  );

  const electionInfoUpdateWithSignature: ElectionInfo = {
    jurisdictionId: nonVxJurisdiction.id,
    electionId,
    title: '   Updated Election  ',
    countyName: '   New Hampshire   ',
    state: '   NH   ',
    seal: '\r\n<svg>updated seal</svg>\r\n',
    type: 'primary',
    date: new DateWithoutTime('2022-01-01'),
    languageCodes: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
    signatureCaption: 'New Caption',
    signatureImage: '\r\n<svg>new signature</svg>\r\n',
  };
  await apiClient.updateElectionInfo(electionInfoUpdateWithSignature);

  // Signature should be included in response
  expect(await apiClient.getElectionInfo({ electionId })).toEqual<ElectionInfo>(
    {
      jurisdictionId: nonVxJurisdiction.id,
      electionId,
      title: 'Updated Election',
      countyName: 'New Hampshire',
      state: 'NH',
      seal: '\r\n<svg>updated seal</svg>\r\n',
      type: 'primary',
      date: new DateWithoutTime('2022-01-01'),
      languageCodes: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
      signatureCaption: 'New Caption',
      signatureImage: '\r\n<svg>new signature</svg>\r\n',
    }
  );

  // Change to NhBallot to test signature behavior
  await apiClient.setBallotTemplate({
    electionId,
    ballotTemplateId: 'VxDefaultBallot',
  });

  // Signature should no longer be included in response
  expect(await apiClient.getElectionInfo({ electionId })).toEqual<ElectionInfo>(
    {
      jurisdictionId: nonVxJurisdiction.id,
      electionId,
      title: 'Updated Election',
      countyName: 'New Hampshire',
      state: 'NH',
      seal: '\r\n<svg>updated seal</svg>\r\n',
      type: 'primary',
      date: new DateWithoutTime('2022-01-01'),
      languageCodes: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
    }
  );

  // Duplicate title + date should be rejected
  const electionId2 = unsafeParse(ElectionIdSchema, 'election-2');
  (
    await apiClient.createElection({
      jurisdictionId: nonVxJurisdiction.id,
      id: electionId2,
    })
  ).unsafeUnwrap();
  expect(
    await apiClient.updateElectionInfo({
      ...electionInfoUpdate,
      electionId: electionId2,
    })
  ).toEqual(err('duplicate-title-and-date'));

  await suppressingConsoleOutput(async () => {
    // Empty string values are rejected
    await expect(
      apiClient.updateElectionInfo({
        jurisdictionId: nonVxJurisdiction.id,
        electionId,
        type: 'primary',
        title: '',
        countyName: '  ',
        state: '',
        seal: '',
        date: new DateWithoutTime('2022-01-01'),
        languageCodes: [LanguageCode.ENGLISH],
      })
    ).rejects.toThrow();

    // Check permissions
    auth0.setLoggedInUser(anotherNonVxUser);
    await expect(apiClient.getElectionInfo({ electionId })).rejects.toThrow(
      'auth:forbidden'
    );
    await expect(
      apiClient.updateElectionInfo(electionInfoUpdate)
    ).rejects.toThrow('auth:forbidden');
  });
});

test('updateDistricts', async () => {
  const { apiClient: api, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nonVxUser);

  const electionId = (
    await api.createElection({
      jurisdictionId: nonVxJurisdiction.id,
      id: 'election-1',
    })
  ).unsafeUnwrap();

  async function expectStoredDistricts(expected: District[]) {
    expect(await api.listDistricts({ electionId })).toEqual(expected);
  }

  async function expectResult(
    expectedResult: Result<void, DuplicateDistrictError>,
    input: {
      electionId: ElectionId;
      deletedDistrictIds?: string[];
      newDistricts?: District[];
      updatedDistricts?: District[];
    }
  ) {
    expect(await api.updateDistricts(input)).toEqual(expectedResult);
  }

  await expectStoredDistricts([]);

  // No-op for empty op list:
  await expectResult(ok(), { electionId });
  await expectStoredDistricts([]);

  // No-op when deleting already-deleted district:
  await expectResult(ok(), { electionId, deletedDistrictIds: ['old-id'] });
  await expectStoredDistricts([]);

  //
  // Fail add on first invalid district and roll back:
  //
  await suppressingConsoleOutput(async () => {
    await expect(
      api.updateDistricts({
        electionId,
        newDistricts: [
          { id: 'd1', name: 'district 1' },
          { id: 'd2', name: '' },
          //                ^^
        ],
      })
    ).rejects.toThrow(/too small/i);

    await expectStoredDistricts([]);
  });

  //
  // Successful batch add:
  //
  await expectResult(ok(), {
    electionId,
    newDistricts: [
      { id: 'd1', name: 'district 1' },
      { id: 'd2', name: 'district 2' },
    ],
  });
  await expectStoredDistricts([
    { id: 'd1', name: 'district 1' },
    { id: 'd2', name: 'district 2' },
  ]);

  //
  // Fail update on first invalid district data and roll back:
  //
  await suppressingConsoleOutput(async () => {
    await expect(
      api.updateDistricts({
        electionId,
        updatedDistricts: [
          { id: 'd1', name: 'district 1' },
          { id: 'd2', name: '' },
          //                ^^
        ],
      })
    ).rejects.toThrow(/too small/i);

    await expectStoredDistricts([
      { id: 'd1', name: 'district 1' },
      { id: 'd2', name: 'district 2' },
    ]);
  });

  //
  // Fail update on first non-existent district ID and roll back:
  //
  await suppressingConsoleOutput(async () => {
    await expect(
      api.updateDistricts({
        electionId,
        updatedDistricts: [
          { id: 'd1', name: 'district 1' },
          { id: 'NA', name: 'district 2' },
          //    ^^^^
        ],
      })
    ).rejects.toThrow(/not found/i);

    await expectStoredDistricts([
      { id: 'd1', name: 'district 1' },
      { id: 'd2', name: 'district 2' },
    ]);
  });

  //
  // Fail update on first conflict in batch add and roll back:
  //
  await expectResult(err({ code: 'duplicate-name', districtId: 'd2' }), {
    electionId,
    updatedDistricts: [
      { id: 'd1', name: 'district 1a' },
      { id: 'd2', name: 'district 1a' },
      //                ^^^^^^^^^^^^^
    ],
  });
  await expectResult(err({ code: 'duplicate-name', districtId: 'd2' }), {
    electionId,
    updatedDistricts: [
      { id: 'd2', name: 'district 1' },
      //                ^^^^^^^^^^^^^
    ],
  });
  await expectStoredDistricts([
    { id: 'd1', name: 'district 1' },
    { id: 'd2', name: 'district 2' },
  ]);

  //
  // Fail add on first conflict in batch add and roll back:
  //
  await expectResult(err({ code: 'duplicate-name', districtId: 'd4' }), {
    electionId,
    newDistricts: [
      { id: 'd3', name: 'district 3' },
      { id: 'd4', name: 'district 1' },
      //                ^^^^^^^^^^^^^ belongs to d1
    ],
  });
  await expectResult(err({ code: 'duplicate-name', districtId: 'd4' }), {
    electionId,
    newDistricts: [
      { id: 'd3', name: 'district 3' },
      { id: 'd4', name: 'district 3' },
      //                ^^^^^^^^^^^^^
    ],
  });
  await expectStoredDistricts([
    { id: 'd1', name: 'district 1' },
    { id: 'd2', name: 'district 2' },
  ]);

  //
  // Can add district with conflicting name if original is deleted in same batch:
  //
  await expectResult(ok(), {
    electionId,
    deletedDistrictIds: ['d1'],
    newDistricts: [{ id: 'd4', name: 'district 1' }],
  });
  await expectStoredDistricts([
    { id: 'd4', name: 'district 1' }, // Expect alphabetical re-ordering.
    { id: 'd2', name: 'district 2' },
  ]);

  //
  // Can add district with conflicting name if original is updated in same batch:
  //
  await expectResult(ok(), {
    electionId,
    updatedDistricts: [{ id: 'd4', name: 'district 4' }],
    newDistricts: [{ id: 'd5', name: 'district 1' }],
  });
  await expectStoredDistricts([
    { id: 'd5', name: 'district 1' },
    { id: 'd2', name: 'district 2' },
    { id: 'd4', name: 'district 4' },
  ]);

  //
  // Add/update/delete in single batch:
  //
  await expectResult(ok(), {
    electionId,
    deletedDistrictIds: ['d2'],
    updatedDistricts: [{ id: 'd5', name: 'district 5' }],
    newDistricts: [{ id: 'd6', name: 'district 6' }],
  });
  await expectStoredDistricts([
    { id: 'd4', name: 'district 4' },
    { id: 'd5', name: 'district 5' },
    { id: 'd6', name: 'district 6' },
  ]);

  //
  // Block ops from unauthorized users:
  //
  auth0.setLoggedInUser(anotherNonVxUser);
  await expect(
    api.updateDistricts({
      electionId,
      deletedDistrictIds: ['d4'],
    })
  ).rejects.toThrow('auth:forbidden');

  auth0.setLoggedInUser(nonVxUser);
  await expectStoredDistricts([
    { id: 'd4', name: 'district 4' },
    { id: 'd5', name: 'district 5' },
    { id: 'd6', name: 'district 6' },
  ]);
});

test('deleting a district updates associated precincts', async () => {
  const baseElectionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();

  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nonVxUser);

  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: baseElectionDefinition.electionData,
      },
    })
  ).unsafeUnwrap();

  // Delete a district associated with a precinct with splits
  const precincts = await apiClient.listPrecincts({ electionId });
  const precinctWithSplits = precincts.find(hasSplits)!;
  const split = precinctWithSplits.splits[0];

  await apiClient.updateDistricts({
    electionId,
    deletedDistrictIds: [split.districtIds[0]],
  });

  let updatedPrecincts = await apiClient.listPrecincts({ electionId });
  let updatedPrecinct = updatedPrecincts.find(
    (p) => p.id === precinctWithSplits.id
  )!;
  assert(hasSplits(updatedPrecinct));

  const updatedSplit = updatedPrecinct.splits[0];
  expect(updatedSplit.districtIds).not.toContain(split.districtIds[0]);

  // Delete a district associated with a precinct without splits
  const precinctWithoutSplits = updatedPrecincts.find(
    (p) => !hasSplits(p)
  ) as PrecinctWithoutSplits;

  await apiClient.updateDistricts({
    electionId,
    deletedDistrictIds: [precinctWithoutSplits.districtIds[0]],
  });

  updatedPrecincts = await apiClient.listPrecincts({ electionId });
  updatedPrecinct = updatedPrecincts.find(
    (p) => p.id === precinctWithoutSplits.id
  )!;
  assert(!hasSplits(updatedPrecinct));
  expect(updatedPrecinct.districtIds).not.toContain(
    precinctWithoutSplits.districtIds[0]
  );
});

test('CRUD precincts', async () => {
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.createElection({
      jurisdictionId: nonVxJurisdiction.id,
      id: unsafeParse(ElectionIdSchema, 'election-1'),
    })
  ).unsafeUnwrap();

  // No precincts initially
  expect(await apiClient.listPrecincts({ electionId })).toEqual([]);

  // Create a precinct
  const precinct1: PrecinctWithoutSplits = {
    id: 'precinct-1',
    name: 'Precinct 1',
    districtIds: [], // Ok to have no districts
  };
  await apiClient.createPrecinct({
    electionId,
    newPrecinct: precinct1,
  });
  expect(await apiClient.listPrecincts({ electionId })).toEqual([precinct1]);

  // Can't create a precinct with an existing name
  expect(
    await apiClient.createPrecinct({
      electionId,
      newPrecinct: {
        id: 'precinct-2',
        name: 'Precinct 1',
        districtIds: [],
      },
    })
  ).toEqual(err('duplicate-precinct-name'));

  // Add a district to the precinct
  const district1: District = {
    id: unsafeParse(DistrictIdSchema, 'district-1'),
    name: 'District 1',
  };
  await apiClient.updateDistricts({
    electionId,
    newDistricts: [district1],
  });
  const updatedPrecinct1: PrecinctWithoutSplits = {
    ...precinct1,
    districtIds: [district1.id],
  };
  await apiClient.updatePrecinct({
    electionId,
    updatedPrecinct: updatedPrecinct1,
  });
  expect(await apiClient.listPrecincts({ electionId })).toEqual([
    updatedPrecinct1,
  ]);

  // Create another precinct with splits
  const precinct2: PrecinctWithSplits = {
    id: 'precinct-2',
    name: 'Precinct 2',
    splits: [
      {
        id: 'split-1',
        name: 'Split 1',
        districtIds: [district1.id],
      },
      {
        id: 'split-2',
        name: 'Split 2',
        districtIds: [],
      },
    ],
  };
  await apiClient.createPrecinct({
    electionId,
    newPrecinct: precinct2,
  });
  expect(await apiClient.listPrecincts({ electionId })).toEqual([
    updatedPrecinct1,
    precinct2,
  ]);

  // Can't update a precinct name to an existing name
  expect(
    await apiClient.updatePrecinct({
      electionId,
      updatedPrecinct: {
        ...updatedPrecinct1,
        name: 'Precinct 2',
      },
    })
  ).toEqual(err('duplicate-precinct-name'));

  // Update splits
  const district2: District = {
    id: unsafeParse(DistrictIdSchema, 'district-2'),
    name: 'District 2',
  };
  await apiClient.updateDistricts({
    electionId,
    newDistricts: [district2],
  });
  const updatedPrecinct2: PrecinctWithSplits = {
    ...precinct2,
    splits: [
      {
        ...precinct2.splits[0],
        districtIds: [district2.id],
      },
      precinct2.splits[1],
    ],
  };
  await apiClient.updatePrecinct({
    electionId,
    updatedPrecinct: updatedPrecinct2,
  });
  expect(await apiClient.listPrecincts({ electionId })).toEqual([
    updatedPrecinct1,
    updatedPrecinct2,
  ]);

  // Can't update a split name to an existing name within the precinct
  expect(
    await apiClient.updatePrecinct({
      electionId,
      updatedPrecinct: {
        ...updatedPrecinct2,
        splits: [
          updatedPrecinct2.splits[0],
          {
            ...updatedPrecinct2.splits[1],
            name: 'Split 1',
          },
        ],
      },
    })
  ).toEqual(err('duplicate-split-name'));

  // Can't create a precinct with splits with the same name
  expect(
    await apiClient.createPrecinct({
      electionId,
      newPrecinct: {
        id: 'precinct-3',
        name: 'Precinct 3',
        splits: [
          {
            id: 'precinct-3-split-1',
            name: 'Split 1',
            districtIds: [district1.id],
          },
          {
            id: 'precinct-3-split-2',
            name: 'Split 1',
            districtIds: [district2.id],
          },
        ],
      },
    })
  ).toEqual(err('duplicate-split-name'));

  // Can't create splits with the same district lists
  expect(
    await apiClient.createPrecinct({
      electionId,
      newPrecinct: {
        id: 'precinct-3',
        name: 'Precinct 3',
        splits: [
          {
            id: 'precinct-3-split-1',
            name: 'Split 1',
            districtIds: [district1.id],
          },
          {
            id: 'precinct-3-split-2',
            name: 'Split 2',
            districtIds: [district1.id],
          },
        ],
      },
    })
  ).toEqual(err('duplicate-split-districts'));

  // Can't update splits to have the same district lists
  expect(
    await apiClient.updatePrecinct({
      electionId,
      updatedPrecinct: {
        ...updatedPrecinct2,
        splits: [
          {
            ...updatedPrecinct2.splits[0],
            districtIds: [district1.id],
          },
          {
            ...updatedPrecinct2.splits[1],
            districtIds: [district1.id],
          },
        ],
      },
    })
  ).toEqual(err('duplicate-split-districts'));

  // Delete a precinct
  await apiClient.deletePrecinct({
    electionId,
    precinctId: precinct1.id,
  });
  expect(await apiClient.listPrecincts({ electionId })).toEqual([
    updatedPrecinct2,
  ]);

  // Try to create an invalid precinct
  await suppressingConsoleOutput(async () => {
    await expect(
      apiClient.createPrecinct({
        electionId,
        newPrecinct: {
          id: 'precinct-1',
          name: '',
          districtIds: [],
        },
      })
    ).rejects.toThrow();
    await expect(
      apiClient.createPrecinct({
        electionId,
        newPrecinct: {
          id: 'precinct-1',
          name: 'Precinct 1',
          districtIds: [unsafeParse(DistrictIdSchema, 'invalid-id')],
        },
      })
    ).rejects.toThrow();
    await expect(
      apiClient.createPrecinct({
        electionId,
        newPrecinct: {
          id: 'precinct-1',
          name: 'Precinct 1',
          splits: [
            {
              id: 'split-1',
              name: 'Split 1',
              districtIds: [unsafeParse(DistrictIdSchema, 'invalid-id')],
            },
          ],
        },
      })
    ).rejects.toThrow();

    // Try to update a precinct that doesn't exist
    await expect(
      apiClient.updatePrecinct({
        electionId,
        updatedPrecinct: {
          ...precinct1,
          id: 'invalid-id',
        },
      })
    ).rejects.toThrow();

    // Try to delete a precinct that doesn't exist
    await expect(
      apiClient.deletePrecinct({
        electionId,
        precinctId: 'invalid-id',
      })
    ).rejects.toThrow();

    // Check permissions
    auth0.setLoggedInUser(anotherNonVxUser);
    await expect(apiClient.listPrecincts({ electionId })).rejects.toThrow(
      'auth:forbidden'
    );
    await expect(
      apiClient.createPrecinct({
        electionId,
        newPrecinct: precinct1,
      })
    ).rejects.toThrow('auth:forbidden');
    await expect(
      apiClient.updatePrecinct({
        electionId,
        updatedPrecinct: updatedPrecinct1,
      })
    ).rejects.toThrow('auth:forbidden');
    await expect(
      apiClient.deletePrecinct({
        electionId,
        precinctId: updatedPrecinct1.id,
      })
    ).rejects.toThrow('auth:forbidden');
  });
});

test('updateParties', async () => {
  const { apiClient: api, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nonVxUser);

  const electionId = (
    await api.createElection({
      jurisdictionId: nonVxJurisdiction.id,
      id: 'election-1',
    })
  ).unsafeUnwrap();

  async function expectStoredParties(expected: Party[]) {
    expect(await api.listParties({ electionId })).toEqual(expected);
  }

  async function expectResult(
    expectedResult: Result<void, DuplicatePartyError>,
    input: {
      electionId: ElectionId;
      deletedPartyIds?: string[];
      newParties?: Party[];
      updatedParties?: Party[];
    }
  ) {
    expect(await api.updateParties(input)).toEqual(expectedResult);
  }

  await expectStoredParties([]);

  // No-op for empty op list:
  await expectResult(ok(), { electionId });
  await expectStoredParties([]);

  // No-op when deleting already-deleted party:
  await expectResult(ok(), { electionId, deletedPartyIds: ['old-id'] });
  await expectStoredParties([]);

  //
  // Fail add on first invalid party data and roll back:
  //
  await suppressingConsoleOutput(async () => {
    await expect(
      api.updateParties({
        electionId,
        newParties: [
          { id: 'p1', abbrev: '1', fullName: 'party 1', name: 'p1' },
          { id: 'p2', abbrev: '', fullName: 'party 2', name: 'p2' },
          //                  ^^
        ],
      })
    ).rejects.toThrow(/too small/i);

    await expectStoredParties([]);
  });

  //
  // Successful batch add:
  //
  await expectResult(ok(), {
    electionId,
    newParties: [
      { id: 'p1', abbrev: '1', fullName: 'party 1', name: 'p1' },
      { id: 'p2', abbrev: '2', fullName: 'party 2', name: 'p2' },
    ],
  });
  await expectStoredParties([
    { id: 'p1', abbrev: '1', fullName: 'party 1', name: 'p1' },
    { id: 'p2', abbrev: '2', fullName: 'party 2', name: 'p2' },
  ]);

  //
  // Fail update on first invalid party data and roll back:
  //
  await suppressingConsoleOutput(async () => {
    await expect(
      api.updateParties({
        electionId,
        updatedParties: [
          { id: 'p1', abbrev: '1', fullName: 'party 1', name: 'p1' },
          { id: 'p2', abbrev: '', fullName: 'party 2', name: 'p2' },
          //                  ^^
        ],
      })
    ).rejects.toThrow(/too small/i);

    await expectStoredParties([
      { id: 'p1', abbrev: '1', fullName: 'party 1', name: 'p1' },
      { id: 'p2', abbrev: '2', fullName: 'party 2', name: 'p2' },
    ]);
  });

  //
  // Fail update on first non-existent party ID and roll back:
  //
  await suppressingConsoleOutput(async () => {
    await expect(
      api.updateParties({
        electionId,
        updatedParties: [
          { id: 'p1', abbrev: '1', fullName: 'party 1', name: 'p1' },
          { id: 'NA', abbrev: '2', fullName: 'party 2', name: 'p2' },
          //    ^^^^
        ],
      })
    ).rejects.toThrow(/not found/i);

    await expectStoredParties([
      { id: 'p1', abbrev: '1', fullName: 'party 1', name: 'p1' },
      { id: 'p2', abbrev: '2', fullName: 'party 2', name: 'p2' },
    ]);
  });

  //
  // Fail update on first conflict in batch and roll back:
  //
  await expectResult(err({ code: 'duplicate-abbrev', partyId: 'p2' }), {
    electionId,
    updatedParties: [
      { id: 'p1', abbrev: '1', fullName: 'party 1a', name: 'p1a' },
      { id: 'p2', abbrev: '1', fullName: 'party 2b', name: 'p2b' },
      //                  ^^^
    ],
  });
  await expectResult(err({ code: 'duplicate-full-name', partyId: 'p2' }), {
    electionId,
    updatedParties: [
      { id: 'p1', abbrev: '1', fullName: 'party 1a', name: 'p1a' },
      { id: 'p2', abbrev: '2', fullName: 'party 1a', name: 'p2b' },
      //                                 ^^^^^^^^^
    ],
  });
  await expectResult(err({ code: 'duplicate-name', partyId: 'p2' }), {
    electionId,
    updatedParties: [
      { id: 'p1', abbrev: '1', fullName: 'party 1a', name: 'p1a' },
      { id: 'p2', abbrev: '2', fullName: 'party 2b', name: 'p1a' },
      //                                                   ^^^^^
    ],
  });
  await expectStoredParties([
    { id: 'p1', abbrev: '1', fullName: 'party 1', name: 'p1' },
    { id: 'p2', abbrev: '2', fullName: 'party 2', name: 'p2' },
  ]);

  //
  // Fail add on first conflict in batch and roll back:
  //
  await expectResult(err({ code: 'duplicate-abbrev', partyId: 'p4' }), {
    electionId,
    newParties: [
      { id: 'p3', abbrev: '3', fullName: 'party 3', name: 'p3' },
      { id: 'p4', abbrev: '1', fullName: 'party 4', name: 'p4' },
      //                  ^^^ belongs to p1
    ],
  });
  await expectResult(err({ code: 'duplicate-full-name', partyId: 'p4' }), {
    electionId,
    newParties: [
      { id: 'p3', abbrev: '3', fullName: 'party 3', name: 'p3' },
      { id: 'p4', abbrev: '4', fullName: 'party 3', name: 'p4' },
      //                                 ^^^^^^^^^
    ],
  });
  await expectResult(err({ code: 'duplicate-name', partyId: 'p4' }), {
    electionId,
    newParties: [
      { id: 'p3', abbrev: '3', fullName: 'party 3', name: 'p3' },
      { id: 'p4', abbrev: '4', fullName: 'party 4', name: 'p1' },
      //                                                  ^^^^
    ],
  });
  await expectStoredParties([
    { id: 'p1', abbrev: '1', fullName: 'party 1', name: 'p1' },
    { id: 'p2', abbrev: '2', fullName: 'party 2', name: 'p2' },
  ]);

  //
  // Can add party with conflicting name if original is deleted in same batch:
  //
  await expectResult(ok(), {
    electionId,
    deletedPartyIds: ['p1'],
    newParties: [{ id: 'p4', abbrev: '1', fullName: 'party 4', name: 'p4' }],
  });
  await expectStoredParties([
    { id: 'p2', abbrev: '2', fullName: 'party 2', name: 'p2' },
    { id: 'p4', abbrev: '1', fullName: 'party 4', name: 'p4' },
  ]);

  //
  // Can add party with conflicting name if original is updated in same batch:
  //
  await expectResult(ok(), {
    electionId,
    updatedParties: [
      { id: 'p4', abbrev: '4', fullName: 'party 4', name: 'p4' },
    ],
    newParties: [{ id: 'p5', abbrev: '1', fullName: 'party 5', name: 'p5' }],
  });
  await expectStoredParties([
    { id: 'p2', abbrev: '2', fullName: 'party 2', name: 'p2' },
    { id: 'p4', abbrev: '4', fullName: 'party 4', name: 'p4' },
    { id: 'p5', abbrev: '1', fullName: 'party 5', name: 'p5' },
  ]);

  //
  // Add/update/delete in single batch:
  //
  await expectResult(ok(), {
    electionId,
    deletedPartyIds: ['p2'],
    updatedParties: [
      { id: 'p5', abbrev: '5', fullName: 'party 5', name: 'p5' },
    ],
    newParties: [{ id: 'p6', abbrev: '6', fullName: 'party 6', name: 'p6' }],
  });
  await expectStoredParties([
    { id: 'p4', abbrev: '4', fullName: 'party 4', name: 'p4' },
    { id: 'p5', abbrev: '5', fullName: 'party 5', name: 'p5' },
    { id: 'p6', abbrev: '6', fullName: 'party 6', name: 'p6' },
  ]);

  //
  // Block ops from unauthorized users:
  //
  auth0.setLoggedInUser(anotherNonVxUser);
  await expect(
    api.updateParties({
      electionId,
      deletedPartyIds: ['p4'],
    })
  ).rejects.toThrow('auth:forbidden');

  auth0.setLoggedInUser(nonVxUser);
  await expectStoredParties([
    { id: 'p4', abbrev: '4', fullName: 'party 4', name: 'p4' },
    { id: 'p5', abbrev: '5', fullName: 'party 5', name: 'p5' },
    { id: 'p6', abbrev: '6', fullName: 'party 6', name: 'p6' },
  ]);
});

test('deleting a party updates associated contests', async () => {
  const baseElectionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();

  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nonVxUser);

  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: baseElectionDefinition.electionData,
      },
    })
  ).unsafeUnwrap();

  // Delete a party associated with a contest
  const contests = await apiClient.listContests({ electionId });
  const contestWithParty = contests.find(
    (c): c is CandidateContest =>
      c.type === 'candidate' && c.partyId !== undefined
  )!;
  assert(contestWithParty.candidates.every((c) => c.partyIds?.length === 1));

  await apiClient.updateParties({
    electionId,
    deletedPartyIds: [contestWithParty.partyId!],
  });

  const updatedContests = await apiClient.listContests({ electionId });
  const updatedContest = updatedContests.find(
    (c) => c.id === contestWithParty.id
  ) as CandidateContest;
  expect(updatedContest.partyId).toBeUndefined();
  expect(updatedContest.candidates.every((c) => c.partyIds === undefined));
});

test('CRUD contests', async () => {
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.createElection({
      jurisdictionId: nonVxJurisdiction.id,
      id: unsafeParse(ElectionIdSchema, 'election-1'),
    })
  ).unsafeUnwrap();
  // Turn off candidate rotation
  await apiClient.setBallotTemplate({
    electionId,
    ballotTemplateId: 'VxDefaultBallot',
  });

  // No contests initially
  expect(await apiClient.listContests({ electionId })).toEqual([]);

  // Create districts and parties
  const district1: District = {
    id: unsafeParse(DistrictIdSchema, 'district-1'),
    name: 'District 1',
  };
  const district2: District = {
    id: unsafeParse(DistrictIdSchema, 'district-2'),
    name: 'District 2',
  };
  await apiClient.updateDistricts({
    electionId,
    newDistricts: [district1, district2],
  });

  const party1: Party = {
    id: unsafeParse(PartyIdSchema, 'party-1'),
    name: 'Party 1',
    abbrev: 'P1',
    fullName: 'Party 1 Full Name',
  };
  const party2: Party = {
    id: unsafeParse(PartyIdSchema, 'party-2'),
    name: 'Party 2',
    abbrev: 'P2',
    fullName: 'Party 2 Full Name',
  };
  await apiClient.updateParties({ electionId, newParties: [party1, party2] });

  // Create a candidate contest
  const contest1: CandidateContest = {
    id: 'contest-1',
    title: 'Contest 1',
    type: 'candidate',
    seats: 1,
    allowWriteIns: true,
    districtId: district1.id,
    candidates: [
      {
        id: 'candidate-1',
        firstName: 'Candidate',
        middleName: 'M',
        lastName: 'One',
        name: 'Candidate M One',
        partyIds: [party1.id],
      },
      {
        id: 'candidate-2',
        firstName: 'Candidate',
        middleName: 'M',
        lastName: 'Two',
        name: 'Candidate M Two',
      },
    ],
  };

  await apiClient.createContest({ electionId, newContest: contest1 });
  expect(await apiClient.listContests({ electionId })).toEqual([contest1]);

  // Create a ballot measure contest
  const contest2: YesNoContest = {
    id: 'contest-2',
    title: 'Contest 2',
    type: 'yesno',
    districtId: district1.id,
    description: 'Contest 2 Description',
    yesOption: {
      id: 'yes-option',
      label: 'Yes',
    },
    noOption: {
      id: 'no-option',
      label: 'No',
    },
  };
  await apiClient.createContest({ electionId, newContest: contest2 });
  expect(await apiClient.listContests({ electionId })).toEqual([
    contest1,
    contest2,
  ]);

  // Create another candidate contest

  const contest3: CandidateContest = {
    id: 'contest-3',
    title: 'Contest 3',
    type: 'candidate',
    seats: 1,
    allowWriteIns: true,
    districtId: district1.id,
    candidates: [
      {
        id: 'candidate-4',
        firstName: 'Candidate',
        middleName: 'N',
        lastName: 'One',
        name: 'Candidate N One',
      },
      {
        id: 'candidate-5',
        firstName: 'Candidate',
        middleName: 'N',
        lastName: 'Two',
        name: 'Candidate N Two',
      },
    ],
  };

  await apiClient.createContest({ electionId, newContest: contest3 });
  // Expect the candidate contest to be inserted ahead of the ballot measure
  expect(await apiClient.listContests({ electionId })).toEqual([
    contest1,
    contest3,
    contest2,
  ]);

  // Update candidate contest
  const updatedContest1: CandidateContest = {
    ...contest1,
    title: 'Updated Contest 1',
    seats: 2,
    allowWriteIns: true,
    candidates: [
      ...contest1.candidates,
      {
        id: 'candidate-3',
        firstName: 'Candidate',
        middleName: 'M',
        lastName: 'Three',
        name: 'Candidate M Three',
      },
    ],
  };
  await apiClient.updateContest({
    electionId,
    updatedContest: updatedContest1,
  });
  // Expect contests to have their ballot order preserved
  expect(await apiClient.listContests({ electionId })).toEqual([
    updatedContest1,
    contest3,
    contest2,
  ]);

  // Update ballot measure contest
  const updatedContest2: YesNoContest = {
    ...contest2,
    title: 'Updated Contest 2',
    description: 'Updated Contest 2 Description',
  };
  await apiClient.updateContest({
    electionId,
    updatedContest: updatedContest2,
  });
  expect(await apiClient.listContests({ electionId })).toEqual([
    updatedContest1,
    contest3,
    updatedContest2,
  ]);

  // Delete a contest
  await apiClient.deleteContest({ electionId, contestId: updatedContest1.id });
  expect(await apiClient.listContests({ electionId })).toEqual([
    contest3,
    updatedContest2,
  ]);

  // Recreate the deleted contest
  await apiClient.createContest({
    electionId,
    newContest: updatedContest1,
  });

  // Can't create a candidate contest with an existing title + seats + term
  expect(
    await apiClient.createContest({
      electionId,
      newContest: {
        id: 'duplicate-contest',
        type: 'candidate',
        title: updatedContest1.title,
        seats: updatedContest1.seats,
        termDescription: updatedContest1.termDescription,
        candidates: [],
        allowWriteIns: true,
        districtId: district1.id,
      },
    })
  ).toEqual(err('duplicate-contest'));

  // Can create a candidate contest with the same title + seats but different term
  expect(
    await apiClient.createContest({
      electionId,
      newContest: {
        ...updatedContest1,
        id: 'contest-4',
        termDescription: 'New Term Description',
        candidates: [],
      },
    })
  ).toEqual(ok());

  // Can create a candidate contest with the same title + term but different seats
  expect(
    await apiClient.createContest({
      electionId,
      newContest: {
        ...updatedContest1,
        id: 'contest-5',
        seats: updatedContest1.seats + 1,
        candidates: [],
      },
    })
  ).toEqual(ok());

  // Can create a candidate contest with the same title + term + seats but different district
  expect(
    await apiClient.createContest({
      electionId,
      newContest: {
        ...updatedContest1,
        id: 'contest-6',
        districtId: district2.id,
        candidates: [],
      },
    })
  ).toEqual(ok());

  // If contests have parties (e.g. in primaries), this is also part of the uniqueness check
  // Can't create a candidate contest with an existing title + seats + term + party
  await apiClient.updateContest({
    electionId,
    updatedContest: {
      ...updatedContest1,
      partyId: party1.id,
    },
  });
  expect(
    await apiClient.createContest({
      electionId,
      newContest: {
        ...updatedContest1,
        id: 'contest-with-party-1',
        partyId: party1.id,
        candidates: [],
      },
    })
  ).toEqual(err('duplicate-contest'));
  // Can create a candidate contest with the same title + seats + term but different party
  expect(
    await apiClient.createContest({
      electionId,
      newContest: {
        ...updatedContest1,
        id: 'contest-with-party-2',
        partyId: party2.id,
        candidates: [],
      },
    })
  ).toEqual(ok());

  // Can't create a ballot measure contest with an existing title
  expect(
    await apiClient.createContest({
      electionId,
      newContest: {
        ...updatedContest2,
        id: 'duplicate-contest',
      },
    })
  ).toEqual(err('duplicate-contest'));

  // Can't update a contest to an existing title + seats + term
  expect(
    await apiClient.updateContest({
      electionId,
      updatedContest: {
        ...updatedContest1,
        termDescription: 'New Term Description',
      },
    })
  ).toEqual(err('duplicate-contest'));

  // Can't update a ballot measure contest to an existing title
  await apiClient.createContest({
    electionId,
    newContest: {
      ...updatedContest2,
      id: 'contest-7',
      title: 'New Contest Title',
    },
  });
  expect(
    await apiClient.updateContest({
      electionId,
      updatedContest: {
        ...updatedContest2,
        title: 'New Contest Title',
      },
    })
  ).toEqual(err('duplicate-contest'));

  // Can't create a contest with duplicate candidates
  expect(
    await apiClient.createContest({
      electionId,
      newContest: {
        ...contest1,
        id: 'duplicate-contest',
        candidates: [
          {
            id: 'dup-candidate-1',
            firstName: 'Candidate',
            middleName: 'M',
            lastName: 'One',
            name: 'Candidate M One',
          },
          {
            id: 'dup-candidate-2',
            firstName: 'Candidate',
            middleName: 'M',
            lastName: 'One',
            name: 'Candidate M One',
          },
        ],
      },
    })
  ).toEqual(err('duplicate-candidate'));

  // Can't create a contest with duplicate candidates with undefined middleName
  expect(
    await apiClient.createContest({
      electionId,
      newContest: {
        ...contest1,
        id: 'duplicate-contest',
        candidates: [
          {
            id: 'dup-candidate-1',
            firstName: 'Candidate',
            lastName: 'One',
            name: 'Candidate One',
          },
          {
            id: 'dup-candidate-2',
            firstName: 'Candidate',
            lastName: 'One',
            name: 'Candidate One',
          },
        ],
      },
    })
  ).toEqual(err('duplicate-candidate'));

  // Can't update a contest to have duplicate candidates
  expect(
    await apiClient.updateContest({
      electionId,
      updatedContest: {
        ...contest1,
        candidates: [
          {
            id: 'dup-candidate-1',
            firstName: 'Candidate',
            middleName: 'M',
            lastName: 'One',
            name: 'Candidate M One',
          },
          {
            id: 'dup-candidate-2',
            firstName: 'Candidate',
            middleName: 'M',
            lastName: 'One',
            name: 'Candidate M One',
          },
        ],
      },
    })
  ).toEqual(err('duplicate-candidate'));

  // Can't create a ballot measure contest with duplicate options
  expect(
    await apiClient.createContest({
      electionId,
      newContest: {
        ...contest2,
        id: 'duplicate-contest',
        yesOption: {
          id: 'dup-yes-option',
          label: 'Yes',
        },
        noOption: {
          id: 'dup-no-option',
          label: 'Yes',
        },
      },
    })
  ).toEqual(err('duplicate-option'));

  // Can't update a ballot measure contest to have duplicate options
  expect(
    await apiClient.updateContest({
      electionId,
      updatedContest: {
        ...contest2,
        yesOption: {
          id: 'dup-yes-option',
          label: 'Yes',
        },
        noOption: {
          id: 'dup-no-option',
          label: 'Yes',
        },
      },
    })
  ).toEqual(err('duplicate-option'));

  await suppressingConsoleOutput(async () => {
    // Try to create an invalid contest
    await expect(
      apiClient.createContest({
        electionId,
        newContest: {
          ...contest1,
          title: '',
        },
      })
    ).rejects.toThrow();

    // Try to update a contest that doesn't exist
    await expect(
      apiClient.updateContest({
        electionId,
        updatedContest: {
          ...contest1,
          id: 'invalid-id',
        },
      })
    ).rejects.toThrow();

    // Try to delete a contest that doesn't exist
    await expect(
      apiClient.deleteContest({
        electionId,
        contestId: 'invalid-id',
      })
    ).rejects.toThrow();

    // Check permissions
    auth0.setLoggedInUser(anotherNonVxUser);
    await expect(apiClient.listContests({ electionId })).rejects.toThrow(
      'auth:forbidden'
    );
    await expect(
      apiClient.createContest({
        electionId,
        newContest: contest1,
      })
    ).rejects.toThrow('auth:forbidden');
    await expect(
      apiClient.updateContest({
        electionId,
        updatedContest: updatedContest1,
      })
    ).rejects.toThrow('auth:forbidden');
    await expect(
      apiClient.deleteContest({
        electionId,
        contestId: updatedContest1.id,
      })
    ).rejects.toThrow('auth:forbidden');
  });
});

test('reordering contests', async () => {
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents:
          electionFamousNames2021Fixtures.electionJson.asText(),
      },
    })
  ).unsafeUnwrap();
  const contests = await apiClient.listContests({ electionId });
  const reversedContests = contests.toReversed();
  await apiClient.reorderContests({
    electionId,
    contestIds: reversedContests.map((c) => c.id),
  });
  expect(await apiClient.listContests({ electionId })).toEqual(
    reversedContests
  );

  await suppressingConsoleOutput(async () => {
    // Try to reorder with an invalid contest ID
    await expect(
      apiClient.reorderContests({
        electionId,
        contestIds: ['invalid-id'],
      })
    ).rejects.toThrow();

    // Try to reorder with a missing contest ID
    await expect(
      apiClient.reorderContests({
        electionId,
        contestIds: contests.slice(1).map((c) => c.id),
      })
    ).rejects.toThrow();

    // Check permissions
    auth0.setLoggedInUser(anotherNonVxUser);
    await expect(
      apiClient.reorderContests({
        electionId,
        contestIds: contests.map((c) => c.id),
      })
    ).rejects.toThrow('auth:forbidden');
  });
});

test('get/update ballot layout', async () => {
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);
  const electionId = unsafeParse(ElectionIdSchema, 'election-1');
  (
    await apiClient.createElection({
      jurisdictionId: nonVxJurisdiction.id,
      id: electionId,
    })
  ).unsafeUnwrap();

  // Default ballot layout
  expect(await apiClient.getBallotLayoutSettings({ electionId })).toEqual({
    paperSize: HmpbBallotPaperSize.Letter,
    compact: false,
  });

  // Update ballot layout
  await apiClient.updateBallotLayoutSettings({
    electionId,
    paperSize: HmpbBallotPaperSize.Legal,
    compact: true,
  });
  expect(await apiClient.getBallotLayoutSettings({ electionId })).toEqual({
    paperSize: HmpbBallotPaperSize.Legal,
    compact: true,
  });

  await suppressingConsoleOutput(async () => {
    // Try to update with invalid values
    await expect(
      apiClient.updateBallotLayoutSettings({
        electionId,
        paperSize: 'invalid' as HmpbBallotPaperSize,
        compact: true,
      })
    ).rejects.toThrow();

    // Check permissions
    auth0.setLoggedInUser(anotherNonVxUser);
    await expect(
      apiClient.getBallotLayoutSettings({ electionId })
    ).rejects.toThrow('auth:forbidden');
    await expect(
      apiClient.updateBallotLayoutSettings({
        electionId,
        paperSize: HmpbBallotPaperSize.Legal,
        compact: true,
      })
    ).rejects.toThrow('auth:forbidden');
  });
});

test('get/update system settings', async () => {
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);
  const electionId = unsafeParse(ElectionIdSchema, 'election-1');
  (
    await apiClient.createElection({
      jurisdictionId: nonVxJurisdiction.id,
      id: electionId,
    })
  ).unsafeUnwrap();

  // Default system settings
  expect(await apiClient.getSystemSettings({ electionId })).toEqual(
    stateDefaultSystemSettings.DEMO
  );

  // Update system settings
  const updatedSystemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    markThresholds: {
      definite: 0.9,
      marginal: 0.8,
    },
    precinctScanAdjudicationReasons: [AdjudicationReason.Overvote],
    centralScanAdjudicationReasons: [
      AdjudicationReason.Undervote,
      AdjudicationReason.MarginalMark,
    ],
    adminAdjudicationReasons: [AdjudicationReason.MarginalMark],
  };
  expect(updatedSystemSettings).not.toEqual(DEFAULT_SYSTEM_SETTINGS);
  await apiClient.updateSystemSettings({
    electionId,
    systemSettings: updatedSystemSettings,
  });
  expect(await apiClient.getSystemSettings({ electionId })).toEqual(
    updatedSystemSettings
  );

  await suppressingConsoleOutput(async () => {
    // Try to update with invalid values
    await expect(
      apiClient.updateSystemSettings({
        electionId,
        systemSettings: {
          ...updatedSystemSettings,
          markThresholds: {
            definite: 1.1, // Must be <= 1
            marginal: 1.1,
          },
        },
      })
    ).rejects.toThrow();

    // Check permissions
    auth0.setLoggedInUser(anotherNonVxUser);
    await expect(apiClient.getSystemSettings({ electionId })).rejects.toThrow(
      'auth:forbidden'
    );
    await expect(
      apiClient.updateSystemSettings({
        electionId,
        systemSettings: updatedSystemSettings,
      })
    ).rejects.toThrow('auth:forbidden');
  });
});

test('Finalize ballots - DEMO state', async () => {
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents:
          electionFamousNames2021Fixtures.electionJson.asText(),
      },
    })
  ).unsafeUnwrap();

  expect(await apiClient.getBallotsFinalizedAt({ electionId })).toEqual(null);
  expect(await apiClient.getElectionPackage({ electionId })).toEqual({});
  expect(await apiClient.getTestDecks({ electionId })).toEqual({});

  const finalizedAt = new Date();
  vi.useFakeTimers({ now: finalizedAt });
  await apiClient.finalizeBallots({ electionId });
  expect(await apiClient.getBallotsFinalizedAt({ electionId })).toEqual(
    finalizedAt
  );
  vi.useRealTimers();

  // Finalizing should trigger package and ballot exports:
  const mainExports = await apiClient.getElectionPackage({ electionId });
  const mainExportsTask = assertDefined(mainExports.task);
  const mainExportsParams = safeParseJson(
    mainExportsTask.payload,
    GenerateElectionPackageAndBallotsPayloadSchema
  ).unsafeUnwrap();
  expect(mainExportsParams).toEqual<GenerateElectionPackageAndBallotsPayload>({
    electionId,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: true,
    shouldExportSampleBallots: false,
    shouldExportTestBallots: true,
  });

  const testDecks = await apiClient.getTestDecks({ electionId });
  const testDecksTask = assertDefined(testDecks.task);
  const testDecksParams = safeParseJson(
    testDecksTask.payload,
    GenerateTestDecksPayloadSchema
  ).unsafeUnwrap();
  expect(testDecksParams).toEqual<GenerateTestDecksPayload>({
    electionId,
    electionSerializationFormat: 'vxf',
  });

  await apiClient.unfinalizeBallots({ electionId });

  expect(await apiClient.getBallotsFinalizedAt({ electionId })).toEqual(null);

  await suppressingConsoleOutput(async () => {
    // Check permissions
    auth0.setLoggedInUser(anotherNonVxUser);
    await expect(
      apiClient.getBallotsFinalizedAt({ electionId })
    ).rejects.toThrow('auth:forbidden');
    await expect(apiClient.finalizeBallots({ electionId })).rejects.toThrow(
      'auth:forbidden'
    );
    await expect(apiClient.unfinalizeBallots({ electionId })).rejects.toThrow(
      'auth:forbidden'
    );
  });
});

test('Finalize ballots - NH state', async () => {
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      jurisdictionId: nhJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents:
          electionFamousNames2021Fixtures.electionJson.asText(),
      },
    })
  ).unsafeUnwrap();

  expect(await apiClient.getBallotsFinalizedAt({ electionId })).toEqual(null);
  expect(await apiClient.getElectionPackage({ electionId })).toEqual({});
  expect(await apiClient.getTestDecks({ electionId })).toEqual({});

  await apiClient.finalizeBallots({ electionId });

  // Exports should be triggered with state-specific settings:
  const mainExports = await apiClient.getElectionPackage({ electionId });
  const mainExportsTask = assertDefined(mainExports.task);
  const mainExportsParams = safeParseJson(
    mainExportsTask.payload,
    GenerateElectionPackageAndBallotsPayloadSchema
  ).unsafeUnwrap();
  expect(mainExportsParams).toEqual<GenerateElectionPackageAndBallotsPayload>({
    electionId,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: true,
    shouldExportTestBallots: false,
  });

  expect(await apiClient.getTestDecks({ electionId })).toEqual({});
});

test('approve ballots', async () => {
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nonVxUser);

  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents:
          electionFamousNames2021Fixtures.electionJson.asText(),
      },
    })
  ).unsafeUnwrap();

  expect(await apiClient.getBallotsApprovedAt({ electionId })).toEqual(null);

  await suppressingConsoleOutput(async () => {
    await expect(apiClient.approveBallots({ electionId })).rejects.toThrow(
      /ballots cannot be approved before being finalized/i
    );
  });

  await apiClient.finalizeBallots({ electionId });

  const now = new Date();
  {
    vi.useFakeTimers({ now });
    await apiClient.approveBallots({ electionId });
    vi.useRealTimers();
  }
  expect(await apiClient.getBallotsApprovedAt({ electionId })).toEqual(now);

  await apiClient.unfinalizeBallots({ electionId });
  expect(await apiClient.getBallotsApprovedAt({ electionId })).toEqual(null);

  // Check permissions:
  await suppressingConsoleOutput(async () => {
    auth0.setLoggedInUser(anotherNonVxUser);

    await expect(
      apiClient.getBallotsApprovedAt({ electionId })
    ).rejects.toThrow('auth:forbidden');

    await expect(apiClient.approveBallots({ electionId })).rejects.toThrow(
      'auth:forbidden'
    );
  });
});

test('cloneElection', async () => {
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  const srcElectionId = 'election-1' as ElectionId;
  auth0.setLoggedInUser(supportUser);
  await apiClient.loadElection({
    upload: {
      format: 'vxf',
      electionFileContents:
        electionFamousNames2021Fixtures.electionJson.asText(),
    },
    newId: srcElectionId,
    jurisdictionId: nonVxJurisdiction.id,
  });
  const srcSystemSettings = await apiClient.getSystemSettings({
    electionId: srcElectionId,
  });
  const modifiedSystemSettings: SystemSettings = {
    ...srcSystemSettings,
    auth: {
      ...srcSystemSettings.auth,
      arePollWorkerCardPinsEnabled: true,
    },
  };
  expect(modifiedSystemSettings).not.toEqual(srcSystemSettings);
  await apiClient.updateSystemSettings({
    electionId: srcElectionId,
    systemSettings: modifiedSystemSettings,
  });

  await apiClient.setBallotTemplate({
    electionId: srcElectionId,
    ballotTemplateId: 'VxDefaultBallot',
  });
  await apiClient.finalizeBallots({ electionId: srcElectionId });

  // Support user can clone from any jurisdiction to another:
  const newElectionId = await apiClient.cloneElection({
    electionId: srcElectionId,
    destElectionId: 'election-clone-1' as ElectionId,
    destJurisdictionId: anotherNonVxJurisdiction.id,
  });
  expect(newElectionId).toEqual('election-clone-1');

  // Ensure cloned election has the same data with new IDs
  const elections = await apiClient.listElections();
  expect(elections[0].electionId).toEqual(newElectionId);
  expect(elections[0].jurisdictionId).toEqual(anotherNonVxJurisdiction.id);

  const srcElectionInfo = await apiClient.getElectionInfo({
    electionId: srcElectionId,
  });
  const destElectionInfo = await apiClient.getElectionInfo({
    electionId: newElectionId,
  });
  expect(destElectionInfo).toEqual({
    ...srcElectionInfo,
    jurisdictionId: anotherNonVxJurisdiction.id,
    electionId: newElectionId,
  });

  const srcDistricts = await apiClient.listDistricts({
    electionId: srcElectionId,
  });
  const destDistricts = await apiClient.listDistricts({
    electionId: newElectionId,
  });
  expect(destDistricts).toEqual(
    srcDistricts.map((district) => ({
      ...district,
      id: expectNotEqualTo(district.id),
    }))
  );

  const srcPrecincts = await apiClient.listPrecincts({
    electionId: srcElectionId,
  });
  const destPrecincts = await apiClient.listPrecincts({
    electionId: newElectionId,
  });
  function updatedDistrictId(srcDistrictId: DistrictId) {
    const srcDistrict = find(srcDistricts, (d) => d.id === srcDistrictId);
    return find(destDistricts, (d) => d.name === srcDistrict.name).id;
  }
  expect(destPrecincts).toEqual(
    srcPrecincts.map((precinct) => {
      if (hasSplits(precinct)) {
        return {
          ...precinct,
          id: expectNotEqualTo(precinct.id),
          spits: precinct.splits.map((split) => ({
            ...split,
            id: expectNotEqualTo(split.id),
            districtIds: split.districtIds.map(updatedDistrictId),
          })),
        };
      } else {
        return {
          ...precinct,
          id: expectNotEqualTo(precinct.id),
          districtIds: precinct.districtIds.map(updatedDistrictId),
        };
      }
    })
  );

  const srcParties = await apiClient.listParties({ electionId: srcElectionId });
  const destParties = await apiClient.listParties({
    electionId: newElectionId,
  });
  expect(destParties).toEqual(
    srcParties.map((party) => ({
      ...party,
      id: expectNotEqualTo(party.id),
    }))
  );

  const srcContests = await apiClient.listContests({
    electionId: srcElectionId,
  });
  const destContests = await apiClient.listContests({
    electionId: newElectionId,
  });
  function updatedPartyId(
    srcPartyId: PartyId | undefined
  ): PartyId | undefined {
    if (!srcPartyId) return undefined;
    const srcParty = find(srcParties, (p) => p.id === srcPartyId);
    return find(destParties, (p) => p.name === srcParty.name).id;
  }
  expect(destContests).toEqual(
    srcContests.map((contest) => {
      switch (contest.type) {
        case 'candidate':
          return {
            ...contest,
            id: expectNotEqualTo(contest.id),
            districtId: updatedDistrictId(contest.districtId),
            partyId: updatedPartyId(contest.partyId),
            candidates: contest.candidates.map((candidate) =>
              expect.objectContaining({
                ...candidate,
                id: expectNotEqualTo(candidate.id),
                partyIds: candidate.partyIds?.map(updatedPartyId).sort(),
              })
            ),
          };
        case 'yesno':
          return {
            ...contest,
            id: expectNotEqualTo(contest.id),
            districtId: updatedDistrictId(contest.districtId),
            yesOption: {
              ...contest.yesOption,
              id: expectNotEqualTo(contest.yesOption.id),
            },
            noOption: {
              ...contest.noOption,
              id: expectNotEqualTo(contest.noOption.id),
            },
          };
      }
    })
  );

  // Should have default system settings for destination jurisdiction
  expect(
    await apiClient.getSystemSettings({ electionId: newElectionId })
  ).toEqual(stateDefaultSystemSettings.DEMO);
  expect(
    await apiClient.getBallotTemplate({ electionId: newElectionId })
  ).toEqual(await apiClient.getBallotTemplate({ electionId: srcElectionId }));
  expect(
    await apiClient.getBallotLayoutSettings({ electionId: newElectionId })
  ).toEqual({
    ...(await apiClient.getBallotLayoutSettings({ electionId: srcElectionId })),
    compact: false, // compact is false by default, and isn't cloned
  });
  expect(
    await apiClient.getBallotsFinalizedAt({ electionId: newElectionId })
  ).toBeNull();

  // Non-Vx user can clone from and to their own jurisdiction:
  auth0.setLoggedInUser(nonVxUser);
  await expect(
    apiClient.cloneElection({
      electionId: srcElectionId,
      destElectionId: 'election-clone-2' as ElectionId,
      destJurisdictionId: nonVxJurisdiction.id,
    })
  ).resolves.toEqual('election-clone-2');

  // Election title has copy prefix if same jurisdiction
  expect(
    (await apiClient.getElectionInfo({ electionId: 'election-clone-2' })).title
  ).toEqual('(Copy) ' + srcElectionInfo.title);

  // Can clone a cloned election and get an additional copy prefix
  await expect(
    apiClient.cloneElection({
      electionId: 'election-clone-2' as ElectionId,
      destElectionId: 'election-clone-3' as ElectionId,
      destJurisdictionId: nonVxJurisdiction.id,
    })
  ).resolves.toEqual('election-clone-3');
  expect(
    (await apiClient.getElectionInfo({ electionId: 'election-clone-3' })).title
  ).toEqual('(Copy) (Copy) ' + srcElectionInfo.title);

  // Non-VX user can't clone from another jurisdiction:
  auth0.setLoggedInUser(anotherNonVxUser);
  await suppressingConsoleOutput(() =>
    expect(
      apiClient.cloneElection({
        electionId: srcElectionId,
        destElectionId: 'election-clone-3' as ElectionId,
        destJurisdictionId: nonVxJurisdiction.id,
      })
    ).rejects.toThrow('auth:forbidden')
  );

  // Non-VX user can't clone from their jurisdiction to another:
  auth0.setLoggedInUser(nonVxUser);
  await suppressingConsoleOutput(() =>
    expect(
      apiClient.cloneElection({
        electionId: srcElectionId,
        destElectionId: 'election-clone-3' as ElectionId,
        destJurisdictionId: anotherNonVxJurisdiction.id,
      })
    ).rejects.toThrow('auth:forbidden')
  );
});

test('Election package management', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { apiClient, workspace, fileStorageClient, auth0, baseUrl } =
    await setupApp({ organizations, jurisdictions, users });

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: baseElectionDefinition.electionData,
      },
    })
  ).unsafeUnwrap();

  const electionPackageBeforeExport = await apiClient.getElectionPackage({
    electionId,
  });
  expect(electionPackageBeforeExport).toEqual({});

  // Initiate an export
  await apiClient.exportElectionPackage({
    electionId,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: true,
    shouldExportTestBallots: true,
  });

  const expectedPayload = JSON.stringify({
    electionId,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: true,
    shouldExportTestBallots: true,
  });
  const electionPackageAfterInitiatingExport =
    await apiClient.getElectionPackage({ electionId });
  expect(electionPackageAfterInitiatingExport).toEqual<MainExportTaskMetadata>({
    task: {
      createdAt: expect.any(Date),
      id: expect.any(String),
      payload: expectedPayload,
      taskName: 'generate_election_package',
    },
  });
  const taskId = assertDefined(electionPackageAfterInitiatingExport.task).id;

  // Check that initiating an export before a prior has completed doesn't trigger a new background
  // task (even with a different serialization format)
  await apiClient.exportElectionPackage({
    electionId,
    electionSerializationFormat: 'cdf',
    shouldExportAudio: false,
    shouldExportSampleBallots: true,
    shouldExportTestBallots: true,
  });
  const electionPackageAfterInitiatingRedundantExport =
    await apiClient.getElectionPackage({ electionId });
  expect(electionPackageAfterInitiatingRedundantExport).toEqual(
    electionPackageAfterInitiatingExport
  );

  // Mock the ballot documents and election definition to speed up this test,
  // since we are just testing the export task flows in this test. The next test
  // checks the actual exported data.
  const props = allBaseBallotProps(baseElectionDefinition.election);
  const deferredRenderResult =
    deferred<
      Awaited<ReturnType<typeof renderAllBallotPdfsAndCreateElectionDefinition>>
    >();
  vi.mocked(renderAllBallotPdfsAndCreateElectionDefinition).mockReturnValue(
    deferredRenderResult.promise
  );

  // Run the background task, emitting progress updates along the way
  const taskPromise = processNextBackgroundTaskIfAny({
    fileStorageClient,
    workspace,
  });
  await backendWaitFor(
    () =>
      expect(
        vi.mocked(renderAllBallotPdfsAndCreateElectionDefinition)
      ).toHaveBeenCalled(),
    { interval: 500, retries: 3 }
  );
  const emitProgress = vi.mocked(renderAllBallotPdfsAndCreateElectionDefinition)
    .mock.lastCall![4]!;
  emitProgress('Test progress message', 2, 10);

  await backendWaitFor(
    async () => {
      const electionPackageDuringExport = await apiClient.getElectionPackage({
        electionId,
      });
      expect(electionPackageDuringExport.task?.progress).toEqual({
        label: 'Test progress message',
        progress: 2,
        total: 10,
      });
    },
    { interval: 500, retries: 3 }
  );

  // Complete the task
  emitProgress('Test progress message', 10, 10);
  deferredRenderResult.resolve({
    ballotPdfs: props.map(() => Uint8Array.from('mock-pdf-contents')),
    electionDefinition: baseElectionDefinition,
  });
  await taskPromise;

  const electionPackageAfterExport = await apiClient.getElectionPackage({
    electionId,
  });
  expect(electionPackageAfterExport).toEqual<MainExportTaskMetadata>({
    task: {
      completedAt: expect.any(Date),
      createdAt: expect.any(Date),
      id: taskId,
      payload: expectedPayload,
      startedAt: expect.any(Date),
      taskName: 'generate_election_package',
      progress: {
        label: 'Test progress message',
        progress: 10,
        total: 10,
      },
    },
    electionPackageUrl: expect.stringMatching(
      regexElectionPackageZip(nonVxJurisdiction)
    ),
    officialBallotsUrl: expect.stringMatching(
      regexOfficialBallotsZip(nonVxJurisdiction)
    ),
    sampleBallotsUrl: expect.stringMatching(
      regexSampleBallotsZip(nonVxJurisdiction)
    ),
    testBallotsUrl: expect.stringMatching(
      regexTestBallotsZip(nonVxJurisdiction)
    ),
  });

  // Check that the correct package was returned by the files API endpoint
  const electionPackageUrl = `${baseUrl}${electionPackageAfterExport.electionPackageUrl}`;
  const electionPackageFileName = path.basename(electionPackageUrl);
  const electionHashes = electionPackageFileName.match(
    /^election-package-(.+)\.zip$/
  )![1];
  expect(electionPackageAfterExport.electionPackageUrl).toContain(
    electionHashes
  );

  // Check that a bad URL returns an error
  await suppressingConsoleOutput(async () => {
    const badUrlResponse = await fetch(electionPackageUrl + 'whoops');
    expect(badUrlResponse.status).toEqual(500);
    expect(await badUrlResponse.json()).toEqual({
      message: '{"type":"undefined-body"}',
    });
  });

  // Check that other jurisdiction users can't access the package
  await suppressingConsoleOutput(async () => {
    auth0.setLoggedInUser(anotherNonVxUser);
    const otherJurisdictionResponse = await fetch(electionPackageUrl);
    expect(otherJurisdictionResponse.status).toEqual(400);
    expect(await otherJurisdictionResponse.json()).toEqual({
      message: 'auth:forbidden',
    });
  });

  // Check that initiating an export after a prior has completed does trigger a new background task
  auth0.setLoggedInUser(nonVxUser);
  await apiClient.exportElectionPackage({
    electionId,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: true,
    shouldExportTestBallots: true,
  });
  const electionPackageAfterInitiatingSecondExport =
    await apiClient.getElectionPackage({ electionId });
  expect(
    electionPackageAfterInitiatingSecondExport
  ).toEqual<MainExportTaskMetadata>({
    task: {
      createdAt: expect.any(Date),
      id: expect.any(String),
      payload: expectedPayload,
      taskName: 'generate_election_package',
    },
    // Previous URL should be cleared out when a new task is started:
    electionPackageUrl: undefined,
  });
  const secondTaskId = assertDefined(
    electionPackageAfterInitiatingSecondExport.task
  ).id;
  expect(secondTaskId).not.toEqual(taskId);

  await suppressingConsoleOutput(async () => {
    // Check permissions
    auth0.setLoggedInUser(anotherNonVxUser);
    await expect(apiClient.getElectionPackage({ electionId })).rejects.toThrow(
      'auth:forbidden'
    );
    await expect(
      apiClient.exportElectionPackage({
        electionId,
        electionSerializationFormat: 'vxf',
        shouldExportAudio: false,
        shouldExportSampleBallots: true,
        shouldExportTestBallots: true,
      })
    ).rejects.toThrow('auth:forbidden');
  });
});

test('Election package and ballots export', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  // Without mocking all the translations some ballot styles for non-English languages don't fit on a letter
  // page for this election. To get around this we use legal paper size for the purposes of this test.
  const electionWithLegalPaper: Election = {
    ...baseElectionDefinition.election,
    ballotLayout: {
      ...baseElectionDefinition.election.ballotLayout,
      paperSize: HmpbBallotPaperSize.Legal,
    },
  };
  const mockSystemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    precinctScanAdjudicationReasons: [
      AdjudicationReason.Overvote,
      AdjudicationReason.UnmarkedWriteIn,
    ],
  };
  const { apiClient, workspace, fileStorageClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: JSON.stringify(electionWithLegalPaper),
      },
    })
  ).unsafeUnwrap();
  await apiClient.updateSystemSettings({
    electionId,
    systemSettings: mockSystemSettings,
  });
  const electionInfo = await apiClient.getElectionInfo({ electionId });
  const ballotStyles = await apiClient.listBallotStyles({ electionId });

  const exportMeta = await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: true,
    shouldExportSampleBallots: true,
    shouldExportTestBallots: true,
    numAuditIdBallots: undefined,
  });

  const electionPackageContents = getExportedFile({
    storage: fileStorageClient,
    jurisdictionId: nonVxJurisdiction.id,
    url: exportMeta.electionPackageUrl,
  });

  const { electionPackage, electionPackageHash } = (
    await readElectionPackageFromBuffer(electionPackageContents)
  ).unsafeUnwrap();

  const {
    electionDefinition,
    metadata,
    systemSettings,
    uiStringAudioClips,
    uiStringAudioIds,
    uiStrings,
    ballots,
  } = electionPackage;
  assert(metadata !== undefined);
  assert(systemSettings !== undefined);
  assert(uiStringAudioClips !== undefined);
  assert(uiStringAudioIds !== undefined);
  assert(uiStrings !== undefined);

  const packageUrl = assertDefined(exportMeta.electionPackageUrl);
  const [, ballotHashFromFileName, electionPackageHashFromFileName] =
    packageUrl.match(ELECTION_PACKAGE_FILE_NAME_REGEX)!;
  expect(electionPackageHashFromFileName).toEqual(
    formatElectionPackageHash(electionPackageHash)
  );
  expect(ballotHashFromFileName).toEqual(
    formatBallotHash(electionDefinition.ballotHash)
  );
  // The election should be retrievable from the ballot hash.
  const exportedElectionId = await workspace.store.getElectionIdFromBallotHash(
    electionDefinition.ballotHash
  );
  expect(exportedElectionId).toBeDefined();
  expect(exportedElectionId).toEqual(electionInfo.electionId);

  // The election is not retrievable from the election package hash, since we don't store that
  const undefinedElectionId =
    await workspace.store.getElectionIdFromBallotHash(electionPackageHash);
  expect(undefinedElectionId).toBeUndefined();

  //
  // Check metadata
  //

  expect(metadata.version).toEqual('latest');

  //
  // Check election definition
  //
  const expectedElectionWithoutBallotStrings: Election = {
    ...electionWithLegalPaper,
    id: electionId,
    // Ballot styles are generated in the app, ignoring the ones in the inputted election
    // definition
    ballotStyles,

    // Include entities with IDs generated by VxDesign
    districts: await apiClient.listDistricts({ electionId }),
    precincts: await apiClient.listPrecincts({ electionId }),
    parties: await apiClient.listParties({ electionId }),
    contests: await apiClient.listContests({ electionId }),

    additionalHashInput: {
      precinctSplitSeals: expect.any(Object),
      precinctSplitSignatureImages: expect.any(Object),
    },
  };
  const expectedElection: Election = {
    ...expectedElectionWithoutBallotStrings,
    // Translated strings for election content and HMPB content should have been
    // added to the election. so they can be included in the ballot hash.
    ballotStrings: expectedEnglishBallotStrings({
      ...expectedElectionWithoutBallotStrings,
      ballotStyles,
    }),
  };

  expect(electionDefinition.election).toEqual({
    ...expectedElection,
    // The base election definition should have been extended with grid layouts. The correctness of
    // the grid layouts is tested by libs/ballot-interpreter tests.
    gridLayouts: expect.any(Array),
  });

  //
  // Check system settings
  //

  expect(systemSettings).toEqual(mockSystemSettings);

  //
  // Check UI strings
  //

  const allBallotLanguages = electionInfo.languageCodes;
  for (const languageCode of allBallotLanguages) {
    expect(countObjectLeaves(uiStrings[languageCode] ?? {})).toBeGreaterThan(
      // A number high enough to give us confidence that we've exported both app and election strings
      200
    );
  }

  for (const electionStringKey of Object.values(ElectionStringKey)) {
    // The current election definition doesn't include any yes-no contests, contest terms, or precinct splits
    if (
      electionStringKey === ElectionStringKey.CONTEST_DESCRIPTION ||
      electionStringKey === ElectionStringKey.CONTEST_OPTION_LABEL ||
      electionStringKey === ElectionStringKey.CONTEST_TERM ||
      electionStringKey === ElectionStringKey.PRECINCT_SPLIT_NAME
    ) {
      continue;
    }

    expect(
      assertDefined(uiStrings[LanguageCode.ENGLISH])[electionStringKey]
    ).toBeDefined();
  }

  const stringsInEnglish: Array<{
    stringKey: string | [string, string];
    stringInEnglish: string;
  }> = [];
  forEachUiString(
    uiStrings,
    ({ languageCode, stringKey, stringInLanguage }) => {
      if (languageCode === LanguageCode.ENGLISH) {
        stringsInEnglish.push({ stringKey, stringInEnglish: stringInLanguage });
      }
    }
  );

  // Verify that strings were translated as expected
  for (const languageCode of allBallotLanguages) {
    if (languageCode === LanguageCode.ENGLISH) {
      continue;
    }

    for (const { stringKey, stringInEnglish } of stringsInEnglish) {
      const stringInLanguage = get(uiStrings, [languageCode, stringKey].flat());
      if (
        Array.isArray(stringKey) &&
        stringKey[0] === ElectionStringKey.BALLOT_STYLE_ID
      ) {
        expect(stringInLanguage).not.toBeDefined();
      } else if (
        Array.isArray(stringKey) &&
        stringKey[0] === ElectionStringKey.CANDIDATE_NAME
      ) {
        expect(stringInLanguage).not.toBeDefined();
      } else if (stringKey === ElectionStringKey.ELECTION_DATE) {
        expect(stringInLanguage).toBeDefined();
      } else if (stringKey === ElectionStringKey.BALLOT_LANGUAGE) {
        expect(stringInLanguage).toBeDefined();
      } else {
        expect(stringInLanguage).toBeDefined();
        expect(stringInLanguage).toEqual(
          mockCloudTranslatedText(stringInEnglish, languageCode)
        );
      }
    }
  }

  //
  // Check uiStringAudioIds.json
  //
  expect(countObjectLeaves(uiStringAudioIds)).toEqual(
    countObjectLeaves(uiStrings) -
      Object.keys(hmpbStringsCatalog).length * allBallotLanguages.length
  );

  //
  // Check audioClips.jsonl
  //
  const audioIds: Set<string> = new Set(
    getObjectLeaves(uiStringAudioIds)
      .flat()
      .filter((audioId): audioId is string => {
        assert(typeof audioId === 'string');
        return !(audioId.startsWith('{{') && audioId.endsWith('}}'));
      })
  );
  const audioIdsInAudioClipsFile = new Set(
    uiStringAudioClips.map(({ id }) => id)
  );
  expect(audioIdsInAudioClipsFile.size).toEqual(audioIds.size);
  for (const audioId of audioIds) {
    expect(audioIdsInAudioClipsFile.has(audioId)).toEqual(true);
  }

  for (const { dataBase64 } of uiStringAudioClips) {
    expect(
      isMockCloudSynthesizedSpeech(
        Buffer.from(dataBase64, 'base64').toString('utf-8')
      )
    ).toEqual(true);
  }

  //
  // Check ballots ZIP
  //

  const calibrationSheetName = 'VxScan-calibration-sheet.pdf';

  for (const [zipUrl, prefix, additionalFiles] of [
    [exportMeta.officialBallotsUrl, 'official', [calibrationSheetName]],
    [exportMeta.sampleBallotsUrl, 'sample', []],
    [exportMeta.testBallotsUrl, 'test', [calibrationSheetName]],
  ] as const) {
    const contents = getExportedFile({
      storage: fileStorageClient,
      jurisdictionId: nonVxJurisdiction.id,
      url: zipUrl,
    });

    const zip = await JsZip.loadAsync(new Uint8Array(contents));

    const expectedFileNames = [
      ...ballotStyles
        .flatMap(({ id, precincts }) =>
          precincts.map((precinctId) => ({
            ballotStyleId: id,
            precinctId,
          }))
        )
        .flatMap(({ ballotStyleId, precinctId }) => {
          const precinctName = find(
            electionDefinition.election.precincts,
            (p) => p.id === precinctId
          ).name.replaceAll(' ', '_');

          const suffix = `ballot-${precinctName}-${ballotStyleId}.pdf`;

          return [
            `${prefix}-absentee-${suffix}`,
            `${prefix}-precinct-${suffix}`,
          ];
        }),
      ...additionalFiles,
    ].sort();

    expect(Object.keys(zip.files).sort()).toEqual(expectedFileNames);

    for (const file of Object.values(zip.files)) {
      expect(await file.async('text')).toContain('%PDF');
    }
  }

  //
  // Check ballots.jsonl
  //
  const expectedEntries = ballotStyles
    .flatMap(({ id, precincts }) =>
      precincts.map((precinctId) => ({ ballotStyleId: id, precinctId }))
    )
    .flatMap(({ ballotStyleId, precinctId }) =>
      Object.values(['precinct', 'absentee']).flatMap((ballotType) =>
        BALLOT_MODES.map((ballotMode) => ({
          ballotStyleId,
          precinctId,
          ballotType,
          ballotMode,
        }))
      )
    );

  // Check that we have the expected number of entries
  assert(ballots, '`ballots` was undefined after parsing election package');
  expect(ballots).toHaveLength(expectedEntries.length);

  // Check each expected entry exists with base64 encoded data
  expectedEntries.forEach((expected) => {
    const matchingEntry = ballots.find(
      (entry) =>
        entry.ballotStyleId === expected.ballotStyleId &&
        entry.precinctId === expected.precinctId &&
        entry.ballotType === expected.ballotType &&
        entry.ballotMode === expected.ballotMode
    );

    assert(
      matchingEntry,
      `Couldn't find match for ballot entry: ${JSON.stringify(expected)}`
    );
    expect(matchingEntry.encodedBallot).toBeTruthy();
    expect(typeof matchingEntry.encodedBallot).toBe('string');
  });

  const ballotCombos: Array<[BallotType, BallotMode]> = [
    [BallotType.Precinct, 'official'],
    [BallotType.Precinct, 'test'],
    [BallotType.Precinct, 'sample'],
    [BallotType.Absentee, 'official'],
    [BallotType.Absentee, 'test'],
    [BallotType.Absentee, 'sample'],
  ];
  const expectedBallotProps = expectedElection.ballotStyles.flatMap(
    (ballotStyle) =>
      ballotStyle.precincts.flatMap((precinctId) =>
        ballotCombos.map(
          ([ballotType, ballotMode]): BaseBallotProps => ({
            election: { ...expectedElection, gridLayouts: undefined },
            ballotStyleId: ballotStyle.id,
            precinctId,
            ballotType,
            ballotMode,
            compact: false,
          })
        )
      )
  );
  expect(
    renderAllBallotPdfsAndCreateElectionDefinition
  ).toHaveBeenCalledExactlyOnceWith(
    expect.any(Object), // Renderer
    ballotTemplates.VxDefaultBallot,
    expectedBallotProps,
    'vxf',
    expect.any(Function) // emitProgress callback
  );
});

test('export omits optional ballots if not enabled', async () => {
  const { apiClient, workspace, fileStorageClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nonVxUser);

  const baseElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();

  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: JSON.stringify(baseElectionDefinition.election),
      },
    })
  ).unsafeUnwrap();

  await apiClient.updateSystemSettings({
    electionId,
    systemSettings: DEFAULT_SYSTEM_SETTINGS,
  });

  const ballotStyles = await apiClient.listBallotStyles({ electionId });

  const exportMeta = await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: false,
    shouldExportTestBallots: false,
    numAuditIdBallots: undefined,
  });

  const electionZip = getExportedFile({
    storage: fileStorageClient,
    jurisdictionId: nonVxJurisdiction.id,
    url: exportMeta.electionPackageUrl,
  });

  const { electionPackage } = (
    await readElectionPackageFromBuffer(electionZip)
  ).unsafeUnwrap();

  const { electionDefinition, ballots } = electionPackage;

  expect(exportMeta.sampleBallotsUrl).toBeUndefined();
  expect(exportMeta.testBallotsUrl).toBeUndefined();
  expect(exportMeta.officialBallotsUrl).toMatch(
    regexOfficialBallotsZip(nonVxJurisdiction)
  );

  const ballotTypes = ['precinct', 'absentee'];
  let expectedNumBallots = 0;
  for (const bs of ballotStyles) {
    expectedNumBallots += bs.precincts.length * ballotTypes.length;
  }

  assert(ballots, '`ballots` was undefined after parsing election package');
  expect(ballots).toHaveLength(expectedNumBallots);
  for (const ballot of ballots) {
    expect(ballot.ballotMode).toEqual<BallotMode>('official');
  }

  //
  // Verify renderer props
  //

  const ballotCombos: Array<[BallotType, BallotMode]> = [
    [BallotType.Precinct, 'official'],
    [BallotType.Absentee, 'official'],
  ];

  const election = electionDefinition.election;
  const expectedBallotProps = election.ballotStyles.flatMap((ballotStyle) =>
    ballotStyle.precincts.flatMap((precinctId) =>
      ballotCombos.map(
        ([ballotType, ballotMode]): BaseBallotProps => ({
          election: { ...election, gridLayouts: undefined },
          ballotStyleId: ballotStyle.id,
          precinctId,
          ballotType,
          ballotMode,
          compact: false,
        })
      )
    )
  );
  expect(
    renderAllBallotPdfsAndCreateElectionDefinition
  ).toHaveBeenCalledExactlyOnceWith(
    expect.any(Object), // Renderer
    ballotTemplates.VxDefaultBallot,
    expectedBallotProps,
    'vxf',
    expect.any(Function) // emitProgress callback
  );
});

test('Election package export with VxDefaultBallot drops signature field', async () => {
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
      newId: 'new-election-id' as ElectionId,
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: baseElectionDefinition.electionData,
      },
    })
  ).unsafeUnwrap();

  // Set a signature in the election info
  await apiClient.updateElectionInfo({
    jurisdictionId: nonVxJurisdiction.id,
    electionId,
    title: baseElectionDefinition.election.title,
    countyName: baseElectionDefinition.election.county.name,
    state: baseElectionDefinition.election.state,
    seal: baseElectionDefinition.election.seal,
    type: baseElectionDefinition.election.type,
    date: baseElectionDefinition.election.date,
    languageCodes: [LanguageCode.ENGLISH],
    signatureImage: 'test-signature-image',
    signatureCaption: 'Test Signature Caption',
  });

  // Ensure we're using VxDefaultBallot template
  await apiClient.setBallotTemplate({
    electionId,
    ballotTemplateId: 'VxDefaultBallot',
  });

  const exportMeta = await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
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

  const { electionPackage } = (
    await readElectionPackageFromBuffer(electionPackageContents)
  ).unsafeUnwrap();

  // Check that the signature field is undefined in the exported election
  expect(electionPackage.electionDefinition.election.signature).toBeUndefined();
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
      newId: 'new-election-id' as ElectionId,
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
  expect(layOutBallotsAndCreateElectionDefinition).toHaveBeenCalledTimes(1);
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
  expect(layOutBallotsAndCreateElectionDefinition).toHaveBeenCalledWith(
    expect.any(Object), // Renderer
    ballotTemplates.VxDefaultBallot,
    expectedBallotProps,
    'vxf',
    expect.any(Function) // emitProgress callback
  );

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
    vi.mocked(createPrecinctTestDeck).mockImplementation(
      async ({ ballotSpecs }) =>
        ballotSpecs.length > 0 ? mockPdfContent : undefined
    );
    vi.mocked(createPrecinctSummaryBallotTestDeck).mockImplementation(
      async ({ ballotSpecs }) =>
        ballotSpecs.length > 0 ? mockPdfContent : undefined
    );
    vi.mocked(createTestDeckTallyReports).mockImplementation(
      async ({ electionDefinition }) => {
        const { election } = electionDefinition;
        const reports = new Map<string, Uint8Array>();
        reports.set(FULL_TEST_DECK_TALLY_REPORT_FILE_NAME, mockPdfContent);
        for (const precinct of election.precincts) {
          reports.set(
            precinctTallyReportFileName(precinct.name),
            mockPdfContent
          );
        }
        return reports;
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
        newId: 'test-bmd-print-mode-election' as ElectionId,
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

    expect(Object.keys(zip.files).sort()).toEqual(expectedFiles.sort());
  }
);

test('Consistency of ballot hash across exports', async () => {
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
      newId: 'new-election-id' as ElectionId,
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
    jurisdictionId: nonVxJurisdiction.id,
    url: exportMeta.electionPackageUrl,
  });

  const { electionDefinition } = (
    await readElectionPackageFromBuffer(electionPackageContents)
  ).unsafeUnwrap().electionPackage;

  const electionPackageFileName = assertDefined(exportMeta.electionPackageUrl);
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
});

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
      newId: 'new-election-id' as ElectionId,
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

test('export ballots with audit IDs', async () => {
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
      newId: 'new-election-id' as ElectionId,
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: baseElectionDefinition.electionData,
      },
    })
  ).unsafeUnwrap();

  const numAuditIdBallots = 3;
  const exportMeta = await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: false,
    shouldExportTestBallots: true,
    numAuditIdBallots,
  });

  const ballotsContents = getExportedFile({
    storage: fileStorageClient,
    jurisdictionId: nonVxJurisdiction.id,
    url: exportMeta.officialBallotsUrl,
  });

  const zip = await JsZip.loadAsync(new Uint8Array(ballotsContents));
  expect(Object.keys(zip.files)).toHaveLength(numAuditIdBallots + 1);
  expect(Object.keys(zip.files).sort()).toEqual([
    'VxScan-calibration-sheet.pdf',
    'official-precinct-ballot-East_Lincoln-1_en-1.pdf',
    'official-precinct-ballot-East_Lincoln-1_en-2.pdf',
    'official-precinct-ballot-East_Lincoln-1_en-3.pdf',
  ]);
  expect(renderAllBallotPdfsAndCreateElectionDefinition).toHaveBeenCalledTimes(
    1
  );
  const ballotStyles = await apiClient.listBallotStyles({ electionId });
  const expectedBallotProps = range(1, numAuditIdBallots + 1).map(
    (i): BaseBallotProps => ({
      ballotStyleId: ballotStyles[0].id,
      precinctId: ballotStyles[0].precincts[0],
      ballotType: BallotType.Precinct,
      ballotMode: 'official',
      election: expect.any(Object),
      ballotAuditId: String(i),
      compact: false,
    })
  );
  expect(renderAllBallotPdfsAndCreateElectionDefinition).toHaveBeenCalledWith(
    expect.any(Object), // Renderer
    ballotTemplates.VxDefaultBallot,
    expectedBallotProps,
    'vxf',
    expect.any(Function) // emitProgress callback
  );
});

test('getBallotPreviewPdf returns a ballot pdf for precinct with splits', async () => {
  const baseElectionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: baseElectionDefinition.electionData,
      },
    })
  ).unsafeUnwrap();
  const ballotStyles = await apiClient.listBallotStyles({ electionId });
  const precincts = await apiClient.listPrecincts({ electionId });

  const precinct = assertDefined(precincts.find((p) => hasSplits(p)));
  const split = precinct.splits[0];
  const ballotStyle = assertDefined(
    ballotStyles.find((style) => {
      return (
        ballotStyleHasPrecinctOrSplit(style, { precinct, split }) &&
        style.languages!.includes(LanguageCode.ENGLISH)
      );
    })
  );

  const result = (
    await apiClient.getBallotPreviewPdf({
      electionId,
      precinctId: precinct.id,
      ballotStyleId: ballotStyle.id,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
    })
  ).unsafeUnwrap();

  await expect(result.pdfData).toMatchPdfSnapshot();

  await suppressingConsoleOutput(async () => {
    // Check permissions
    auth0.setLoggedInUser(anotherNonVxUser);
    await expect(
      apiClient.getBallotPreviewPdf({
        electionId,
        precinctId: precinct.id,
        ballotStyleId: ballotStyle.id,
        ballotType: BallotType.Precinct,
        ballotMode: 'test',
      })
    ).rejects.toThrow('auth:forbidden');
  });
});

test('getBallotPreviewPdf returns a ballot pdf for NH election with split precincts and additional config options', async () => {
  const baseElectionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  const election: Election = {
    ...baseElectionDefinition.election,
    state: 'New Hampshire',
    signature: {
      caption: 'Caption To Be Overwritten',
      image: 'Image To Be Overwritten',
    },
  };
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      jurisdictionId: nhJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: JSON.stringify(election),
      },
    })
  ).unsafeUnwrap();
  const ballotStyles = await apiClient.listBallotStyles({ electionId });
  const precincts = await apiClient.listPrecincts({ electionId });

  const splitPrecinctIndex = precincts.findIndex((p) => hasSplits(p));
  assert(splitPrecinctIndex >= 0);
  const precinct = precincts[splitPrecinctIndex] as PrecinctWithSplits;
  const split = precinct.splits[0];
  split.clerkSignatureCaption = 'Test Clerk Caption';
  split.clerkSignatureImage = readFileSync(
    './test/mockSignature.svg'
  ).toString();
  split.electionTitleOverride = 'Test Election Title Override';

  await apiClient.updatePrecinct({ electionId, updatedPrecinct: precinct });

  const ballotStyle = assertDefined(
    ballotStyles.find((style) => {
      return (
        ballotStyleHasPrecinctOrSplit(style, { precinct, split }) &&
        style.languages!.includes(LanguageCode.ENGLISH)
      );
    })
  );

  const result = (
    await apiClient.getBallotPreviewPdf({
      electionId,
      precinctId: precinct.id,
      ballotStyleId: ballotStyle.id,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
    })
  ).unsafeUnwrap();

  await expect(result.pdfData).toMatchPdfSnapshot({ failureThreshold: 0.001 });
});

test('getBallotPreviewPdf returns a ballot pdf for precinct with no split', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: baseElectionDefinition.electionData,
      },
    })
  ).unsafeUnwrap();
  const ballotStyles = await apiClient.listBallotStyles({ electionId });
  const precincts = await apiClient.listPrecincts({ electionId });

  function hasDistrictIds(
    precinct: Precinct
  ): precinct is PrecinctWithoutSplits {
    return 'districtIds' in precinct && precinct.districtIds.length > 0;
  }

  const precinct = assertDefined(precincts.find((p) => hasDistrictIds(p)));

  const result = (
    await apiClient.getBallotPreviewPdf({
      electionId,
      precinctId: precinct.id,
      ballotStyleId: assertDefined(
        ballotStyles.find(
          (style) =>
            style.districts.includes(precinct.districtIds[0]) &&
            style.languages!.includes(LanguageCode.ENGLISH)
        )
      ).id,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
    })
  ).unsafeUnwrap();

  await expect(result.pdfData).toMatchPdfSnapshot({ failureThreshold: 0.01 });
});

test('getBallotPreviewPdf returns a ballot pdf for nh precinct with no split', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const election: Election = {
    ...baseElectionDefinition.election,
    state: 'New Hampshire',
    signature: {
      image: readFileSync('./test/mockSignature.svg').toString(),
      caption: 'Test Image Caption',
    },
  };
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      jurisdictionId: nhJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: JSON.stringify(election),
      },
    })
  ).unsafeUnwrap();
  const ballotStyles = await apiClient.listBallotStyles({ electionId });
  const precincts = await apiClient.listPrecincts({ electionId });

  function hasDistrictIds(
    precinct: Precinct
  ): precinct is PrecinctWithoutSplits {
    return 'districtIds' in precinct && precinct.districtIds.length > 0;
  }

  const precinct = assertDefined(precincts.find((p) => hasDistrictIds(p)));

  const result = (
    await apiClient.getBallotPreviewPdf({
      electionId,
      precinctId: precinct.id,
      ballotStyleId: assertDefined(
        ballotStyles.find(
          (style) =>
            style.districts.includes(precinct.districtIds[0]) &&
            style.languages!.includes(LanguageCode.ENGLISH)
        )
      ).id,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
    })
  ).unsafeUnwrap();

  await expect(result.pdfData).toMatchPdfSnapshot({ failureThreshold: 0.01 });
});

test.each<{
  description: string;
  ballotMeasureDescription: string;
  isRenderSuccessful: boolean;
}>([
  {
    description: 'Many short paragraphs',
    ballotMeasureDescription: '<p>Text</p>'.repeat(50),
    isRenderSuccessful: true,
  },
  {
    description: 'One long paragraph',
    ballotMeasureDescription: `<p>${'Text '.repeat(10000)}</p>`,
    isRenderSuccessful: false,
  },
  {
    description: 'One short paragraph followed by one long paragraph',
    ballotMeasureDescription: `<p>Text</p><p>${'Text '.repeat(10000)}</p>`,
    isRenderSuccessful: false,
  },
])(
  'splitting long ballot measures across pages when using NH template - $description',
  async ({ ballotMeasureDescription, isRenderSuccessful }) => {
    const baseElectionDefinition =
      electionFamousNames2021Fixtures.readElectionDefinition();
    const election: Election = {
      ...baseElectionDefinition.election,
      contests: [
        ...baseElectionDefinition.election.contests,
        {
          id: 'long-ballot-measure',
          type: 'yesno',
          title: 'Long Ballot Measure',
          description: ballotMeasureDescription,
          yesOption: { id: 'yes-option', label: 'Yes' },
          noOption: { id: 'no-option', label: 'No' },
          districtId: baseElectionDefinition.election.districts[0].id,
        },
      ],
      signature: {
        image: readFileSync('./test/mockSignature.svg').toString(),
        caption: 'Caption',
      },
    };
    const { apiClient, auth0 } = await setupApp({
      organizations,
      jurisdictions,
      users,
    });

    auth0.setLoggedInUser(nonVxUser);
    const electionId = (
      await apiClient.loadElection({
        newId: 'new-election-id' as ElectionId,
        jurisdictionId: nhJurisdiction.id,
        upload: {
          format: 'vxf',
          electionFileContents: JSON.stringify(election),
        },
      })
    ).unsafeUnwrap();

    // IDs are updated after loading into VxDesign so we can't refer to the original election
    // definition IDs
    const contests = await apiClient.listContests({ electionId });
    const precincts = await apiClient.listPrecincts({ electionId });
    const ballotStyles = await apiClient.listBallotStyles({ electionId });

    const contest = assertDefined(
      contests.find((c) => c.title === 'Long Ballot Measure')
    );
    const precinctId = assertDefined(
      precincts.find(
        (p) => 'districtIds' in p && p.districtIds.includes(contest.districtId)
      )
    ).id;
    const ballotStyleId = assertDefined(
      ballotStyles.find((bs) => bs.districts.includes(contest.districtId))
    ).id;

    const result = await apiClient.getBallotPreviewPdf({
      electionId,
      precinctId,
      ballotStyleId,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
    });

    if (isRenderSuccessful) {
      expect(result.isOk()).toEqual(true);
      const { pdfData } = result.unsafeUnwrap();
      await expect(pdfData).toMatchPdfSnapshot({ failureThreshold: 0.01 });
    } else {
      expect(result.isOk()).toEqual(false);
      expect(result).toEqual(
        err({
          error: 'contestTooLong',
          contest: expect.objectContaining({ id: contest.id }),
        })
      );
    }
  }
);

test('setBallotTemplate changes the ballot template used to render ballots', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { apiClient, fileStorageClient, workspace, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: electionDefinition.electionData,
      },
    })
  ).unsafeUnwrap();
  expect(await apiClient.getBallotTemplate({ electionId })).toEqual(
    'VxDefaultBallot'
  );

  await apiClient.setBallotTemplate({
    electionId,
    ballotTemplateId: 'NhBallot',
  });
  expect(await apiClient.getBallotTemplate({ electionId })).toEqual('NhBallot');

  const props = allBaseBallotProps(electionDefinition.election);
  vi.mocked(renderAllBallotPdfsAndCreateElectionDefinition).mockResolvedValue({
    ballotPdfs: props.map(() => Uint8Array.from('mock-pdf-contents')),
    electionDefinition,
  });
  await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: true,
    shouldExportTestBallots: true,
    numAuditIdBallots: undefined,
  });
  expect(renderAllBallotPdfsAndCreateElectionDefinition).toHaveBeenCalledWith(
    expect.any(Object), // Renderer
    ballotTemplates.NhBallot,
    expect.any(Array), // Ballot props
    'vxf',
    expect.any(Function) // emitProgress callback
  );
  expect(
    vi.mocked(renderAllBallotPdfsAndCreateElectionDefinition).mock.calls[0][2]
  ).toHaveLength(props.length);

  await suppressingConsoleOutput(async () => {
    // Check permissions
    auth0.setLoggedInUser(anotherNonVxUser);
    await expect(
      apiClient.setBallotTemplate({
        electionId,
        ballotTemplateId: 'NhBallot',
      })
    ).rejects.toThrow('auth:forbidden');
  });
});

test('getUser', async () => {
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  await suppressingConsoleOutput(() =>
    expect(apiClient.getUser()).rejects.toThrow('auth:unauthorized')
  );
  auth0.setLoggedInUser(vxUser);
  expect(await apiClient.getUser()).toEqual(vxUser);
  auth0.setLoggedInUser(nonVxUser);
  expect(await apiClient.getUser()).toEqual(nonVxUser);
  auth0.setLoggedInUser(nonVxOrganizationUser);
  expect(await apiClient.getUser()).toEqual(nonVxOrganizationUser);
  auth0.setLoggedInUser(supportUser);
  expect(await apiClient.getUser()).toEqual(supportUser);
});

test('listJurisdictions', async () => {
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  await suppressingConsoleOutput(() =>
    expect(apiClient.listJurisdictions()).rejects.toThrow('auth:unauthorized')
  );
  auth0.setLoggedInUser(supportUser);
  expect(await apiClient.listJurisdictions()).toEqual(
    jurisdictions.toSorted((j1, j2) => j1.name.localeCompare(j2.name))
  );
  auth0.setLoggedInUser(nonVxUser);
  expect(await apiClient.listJurisdictions()).toEqual([
    nhJurisdiction,
    nonVxJurisdiction,
  ]);
  auth0.setLoggedInUser(nonVxOrganizationUser);
  expect(await apiClient.listJurisdictions()).toEqual([
    anotherNonVxJurisdiction,
    msJurisdiction,
    nhJurisdiction,
    nonVxJurisdiction,
  ]);
  auth0.setLoggedInUser(sliUser);
  expect(await apiClient.listJurisdictions()).toEqual([sliJurisdiction]);
});

test('feature configs and default system settings', async () => {
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(vxUser);
  expect(await apiClient.getUserFeatures()).toEqual(userFeatureConfigs.vx);
  auth0.setLoggedInUser(nonVxUser);
  expect(await apiClient.getUserFeatures()).toEqual({});
  auth0.setLoggedInUser(sliUser);
  expect(await apiClient.getUserFeatures()).toEqual(userFeatureConfigs.sli);

  auth0.setLoggedInUser(supportUser);
  const vxElectionId = (
    await apiClient.createElection({
      id: 'vx-election-id' as ElectionId,
      jurisdictionId: vxJurisdiction.id,
    })
  ).unsafeUnwrap();
  expect(
    await apiClient.getStateFeatures({ electionId: vxElectionId })
  ).toEqual(stateFeatureConfigs.DEMO);
  expect(
    await apiClient.getSystemSettings({ electionId: vxElectionId })
  ).toEqual(stateDefaultSystemSettings.DEMO);

  const sliElectionId = (
    await apiClient.createElection({
      id: 'sli-election-id' as ElectionId,
      jurisdictionId: sliJurisdiction.id,
    })
  ).unsafeUnwrap();
  expect(
    await apiClient.getStateFeatures({ electionId: sliElectionId })
  ).toEqual(stateFeatureConfigs.DEMO);
  expect(
    await apiClient.getSystemSettings({ electionId: sliElectionId })
  ).toEqual(SLI_DEFAULT_SYSTEM_SETTINGS);

  const nhElectionId = (
    await apiClient.createElection({
      id: 'nh-election-id' as ElectionId,
      jurisdictionId: nhJurisdiction.id,
    })
  ).unsafeUnwrap();
  expect(
    await apiClient.getStateFeatures({ electionId: nhElectionId })
  ).toEqual(stateFeatureConfigs.NH);
  expect(
    await apiClient.getSystemSettings({ electionId: nhElectionId })
  ).toEqual(stateDefaultSystemSettings.NH);

  const msElectionId = (
    await apiClient.createElection({
      id: 'ms-election-id' as ElectionId,
      jurisdictionId: msJurisdiction.id,
    })
  ).unsafeUnwrap();

  expect(
    await apiClient.getStateFeatures({ electionId: msElectionId })
  ).toEqual(stateFeatureConfigs.MS);
  expect(
    await apiClient.getSystemSettings({ electionId: msElectionId })
  ).toEqual(stateDefaultSystemSettings.MS);
});

test('getResultsReportingUrl', async () => {
  process.env = {
    ...process.env,
    BASE_URL: 'https://test-base-url.com',
  };
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(vxUser);
  expect(await apiClient.getResultsReportingUrl()).toEqual(
    'https://test-base-url.com/report'
  );
  auth0.setLoggedInUser(nonVxUser);
  expect(await apiClient.getResultsReportingUrl()).toEqual(
    'https://test-base-url.com/report'
  );
  auth0.setLoggedInUser(sliUser);
  expect(await apiClient.getResultsReportingUrl()).toEqual(
    'https://test-base-url.com/report'
  );
});

test('getBaseUrl', async () => {
  process.env = { ...process.env, BASE_URL: 'https://test-base-url.com' };
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(vxUser);

  expect(await apiClient.getBaseUrl()).toEqual('https://test-base-url.com');
});

test('api call logging', async () => {
  const { apiClient, logger, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  await expect(apiClient.getUser()).rejects.toThrow('auth:unauthorized');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ApiCall,
    'system',
    expect.objectContaining({
      methodName: 'getUser',
      input: JSON.stringify(undefined),
      disposition: 'failure',
      error: 'auth:unauthorized',
    })
  );

  auth0.setLoggedInUser(vxUser);
  await apiClient.createElection({
    id: 'election-id' as ElectionId,
    jurisdictionId: vxJurisdiction.id,
  });
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ApiCall,
    'system',
    expect.objectContaining({
      methodName: 'createElection',
      input: JSON.stringify({
        id: 'election-id',
        jurisdictionId: vxJurisdiction.id,
      }),
      userJurisdictionIds: vxJurisdiction.id,
      userId: vxUser.id,
      disposition: 'success',
    })
  );
});

test('decryptCvrBallotAuditIds', async () => {
  const secretKey = 'test-secret-key';
  const cvrDirectoryPath =
    electionPrimaryPrecinctSplitsFixtures.castVoteRecordExport.asDirectoryPath();
  // Add BallotAuditId to CVR files
  const cvrPaths = await readdir(cvrDirectoryPath);
  for (const [i, cvrPath] of cvrPaths.entries()) {
    if (cvrPath === 'metadata.json') continue;
    await execFile('sed', [
      '-i',
      's/"@type":"CVR.CVR"/"@type":"CVR.CVR","BallotAuditId":"' +
        (i + 1) +
        '"/',
      join(
        cvrDirectoryPath,
        cvrPath,
        CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
      ),
    ]);
  }
  const cvrZipPath = makeTemporaryPath({ postfix: '.zip' });
  await execFile('zip', ['-r', cvrZipPath, '.'], { cwd: cvrDirectoryPath });
  const cvrZipFileContents = await readFile(cvrZipPath);

  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);

  const decryptedCvrZipContents = await apiClient.decryptCvrBallotAuditIds({
    cvrZipFileContents,
    secretKey,
  });
  const decryptedCvrZip = await openZip(
    new Uint8Array(decryptedCvrZipContents)
  );
  const decryptedCvrZipEntries = getEntries(decryptedCvrZip);

  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
  );
  const cvrContents = (
    await readCastVoteRecordExport(cvrDirectoryPath)
  ).unsafeUnwrap();
  for await (const cvrResult of cvrContents.castVoteRecordIterator) {
    const cvr = cvrResult.unsafeUnwrap();
    // At the top of this file, we mock implementation for decryptAes256 to
    // create this expected decrypted value
    const cvrFileName = `decrypted-${cvr.castVoteRecord.BallotAuditId}.json`;
    const cvrFileEntry = getFileByName(decryptedCvrZipEntries, cvrFileName);
    const contents = JSON.parse(await cvrFileEntry.async('text'));
    expect(contents.CVR[0]).toEqual(cvr.castVoteRecord);
  }
});

test('MS election and results SEMS conversion', async () => {
  const { apiClient, auth0, fileStorageClient, workspace } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(anotherNonVxUser);

  // Load election
  const electionId = (
    await apiClient.loadElection({
      newId: 'ms-election-id' as ElectionId,
      jurisdictionId: msJurisdiction.id,
      upload: {
        format: 'ms-sems',
        electionFileContents: readFixture(
          'ms-sems-election-general-ballot-measures-10.csv'
        ),
        candidateFileContents: readFixture(
          'ms-sems-election-candidates-general-ballot-measures-10.csv'
        ),
      },
    })
  ).unsafeUnwrap();
  expect(await apiClient.getElectionInfo({ electionId })).toMatchObject({
    title: 'Mock General Election Greenwood 2020',
    externalSource: 'ms-sems',
  });
  expect(await apiClient.getBallotTemplate({ electionId })).toEqual('MsBallot');

  // Can't convert results before exporting election package
  expect(
    await apiClient.convertMsResults({
      electionId,
      allPrecinctsTallyReportContents: '',
    })
  ).toEqual(err('no-election-export-found'));

  // Export election package
  const exportMeta = await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: true,
    shouldExportSampleBallots: true,
    shouldExportTestBallots: true,
    numAuditIdBallots: undefined,
  });

  const electionPackageContents = getExportedFile({
    storage: fileStorageClient,
    jurisdictionId: msJurisdiction.id,
    url: exportMeta.electionPackageUrl,
  });

  const { electionPackage } = (
    await readElectionPackageFromBuffer(electionPackageContents)
  ).unsafeUnwrap();

  // Convert results
  await apiClient.convertMsResults({
    electionId,
    allPrecinctsTallyReportContents: generateAllPrecinctsTallyReport(
      electionPackage.electionDefinition
    ),
  });
});

function regexElectionPackageZip(jurisdiction: Jurisdiction) {
  return new RegExp(`${jurisdiction.id}/election-package`);
}

function regexOfficialBallotsZip(jurisdiction: Jurisdiction) {
  return new RegExp(`${jurisdiction.id}/official-ballots`);
}

function regexSampleBallotsZip(jurisdiction: Jurisdiction) {
  return new RegExp(`${jurisdiction.id}/sample-ballots`);
}

function regexTestBallotsZip(jurisdiction: Jurisdiction) {
  return new RegExp(`${jurisdiction.id}/test-ballots`);
}
