import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  DateWithoutTime,
  type Result,
  assert,
  assertDefined,
  err,
  find,
  ok,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionGeneralFixtures,
  electionCombinedBallotPrimaryFixtures,
  electionPrimaryPrecinctSplitsFixtures,
  makeTemporaryPath,
  makeTemporaryFile,
} from '@votingworks/fixtures';
import {
  AdjudicationReason,
  HmpbBallotPaperSize,
  BallotType,
  type Candidate,
  type CandidateContest,
  DEFAULT_SYSTEM_SETTINGS,
  type SystemSettings,
  LanguageCode,
  unsafeParse,
  ElectionIdSchema,
  DistrictIdSchema,
  type ElectionId,
  type Precinct,
  hasSplits,
  type District,
  type Party,
  PartyIdSchema,
  type YesNoContest,
  type PartyId,
  type DistrictId,
  CastVoteRecordExportFileName,
  safeParseJson,
  type PrecinctWithoutSplits,
  type PrecinctWithSplits,
  LATEST_SOFTWARE_VERSION,
  straightPartyNotYetImplemented,
} from '@votingworks/types';
import {
  ballotStyleHasPrecinctOrSplit,
  BooleanEnvironmentVariableName,
  getEntries,
  getFeatureFlagMock,
  getFileByName,
  openZip,
} from '@votingworks/utils';
import { execFile, readCastVoteRecordExport } from '@votingworks/backend';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import {
  allBaseBallotProps,
  ballotTemplates,
  renderAllBallotPdfsAndCreateElectionDefinition,
  generateBallotStylesDeprecated,
  type ScratchDir,
} from '@votingworks/hmpb';
import { join } from 'node:path';
import { LogEventId } from '@votingworks/logging';
import { readdir, readFile } from 'node:fs/promises';
import { createSummaryBallotTestDeck } from '@votingworks/test-decks';
import {
  type ApiClient,
  exportElectionPackage,
  testSetupHelpers,
} from '../test/helpers.js';
import {
  createPrecinctTestDeck,
  createTestDeckTallyReports,
} from './test_decks.js';
import type {
  ElectionInfo,
  ElectionInfoUpdate,
  ElectionListing,
  ElectionStatus,
} from './types.js';
import type { DuplicateDistrictError, DuplicatePartyError } from './store.js';
import { stateFeatureConfigs, userFeatureConfigs } from './features.js';
import { buildApi } from './app.js';
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
  miJurisdiction,
} from '../test/mocks.js';
import {
  SLI_DEFAULT_SYSTEM_SETTINGS,
  stateDefaultSystemSettings,
} from './system_settings.js';
import {
  type GenerateElectionPackageAndBallotsPayload,
  GenerateElectionPackageAndBallotsPayloadSchema,
} from './worker/generate_election_package_and_ballots.js';
import {
  type GenerateTestDecksPayload,
  GenerateTestDecksPayloadSchema,
} from './worker/generate_test_decks.js';

vi.setConfig({
  testTimeout: 120_000,
});

function expectNotEqualTo(str: string) {
  return expect.not.stringMatching(new RegExp(`^${str}$`));
}

function compareName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name);
}

// Editing states require absentee polling places to cover every precinct before
// ballots can be finalized; this adds one covering all precincts.
async function addAbsenteePollingPlaceCoveringAllPrecincts(
  apiClient: ApiClient,
  electionId: ElectionId
) {
  const precincts = await apiClient.listPrecincts({ electionId });
  (
    await apiClient.setPollingPlace({
      electionId,
      place: {
        id: 'absentee-all',
        name: 'Absentee Voting',
        type: 'absentee',
        precincts: Object.fromEntries(
          precincts.map((precinct) => [precinct.id, { type: 'whole' }])
        ),
      },
    })
  ).unsafeUnwrap();
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

test('all methods require authentication', async () => {
  const { apiClient, baseUrl, ...context } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  await suppressingConsoleOutput(async () => {
    const apiMethodNames = Object.keys(buildApi(context).methods());
    for (const apiMethodName of apiMethodNames) {
      // @ts-expect-error - Don't pass any input to the API methods since we expect
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
    jurisdictionName: sliElection.jurisdiction.name,
    date: sliElection.date,
    languageCodes: [LanguageCode.ENGLISH],
    state: sliElection.state,
    seal: sliElection.seal,
    type: sliElection.type,
    isMiCombinedBallotPrimary: false,
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
      districtIds: [election2Districts[0]!.id],
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
    sliElection.contests.map((contest) => {
      if (contest.type === 'straight-party') {
        return straightPartyNotYetImplemented();
      }
      return {
        ...contest,
        id: expectNotEqualTo(contest.id),
        districtId: election2Districts[0]!.id,
        ...(contest.type === 'candidate'
          ? {
              candidates: contest.candidates.map((candidate) =>
                expect.objectContaining({
                  ...candidate,
                  id: expectNotEqualTo(candidate.id),
                  partyIds: candidate.partyIds
                    ?.map(updatedPartyId)
                    .sort((a, b) => {
                      const aName = election2Parties.find(
                        (p) => p.id === a
                      )?.name;
                      const bName = election2Parties.find(
                        (p) => p.id === b
                      )?.name;
                      assert(
                        typeof aName === 'string',
                        `no party with id: ${a}`
                      );
                      assert(
                        typeof bName === 'string',
                        `no party with id: ${b}`
                      );
                      return aName.localeCompare(bName);
                    }),
                  firstName: expect.any(String),
                  // TODO upgrade vitest to use expect.toBeOneOf
                  // middleName: expect.toBeOneOf([expect.any(String), undefined]),
                  lastName: expect.any(String),
                })
              ),
            }
          : {
              options: contest.options.map((option) => ({
                ...option,
                id: expectNotEqualTo(option.id),
              })),
            }),
      };
    })
  );
  expect(
    await apiClient.listBallotStyles({ electionId: sliElectionId })
  ).toEqual(
    generateBallotStylesDeprecated({
      ballotLanguageConfigs: [{ languages: [LanguageCode.ENGLISH] }],
      contests: election2Contests,
      electionType: sliElection.type,
      isMiCombinedBallotPrimary: false,
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
  await addAbsenteePollingPlaceCoveringAllPrecincts(apiClient, sliElectionId);
  await apiClient.finalizeBallots({ electionId: sliElectionId });
  expect((await apiClient.listElections())[0]!.status).toEqual<ElectionStatus>(
    'ballotsFinalized'
  );

  await apiClient.approveBallots({ electionId: sliElectionId });
  expect((await apiClient.listElections())[0]!.status).toEqual<ElectionStatus>(
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
      jurisdictionName: nonVxJurisdiction.name,
      state: nonVxJurisdiction.stateCode,
      seal: '',
      type: 'general',
      isMiCombinedBallotPrimary: false,
      date: DateWithoutTime.today(),
      languageCodes: [LanguageCode.ENGLISH],
    }
  );

  // Update election info
  const electionInfoUpdate: ElectionInfoUpdate = {
    electionId,
    // trim text values
    title: '   Updated Election  ',
    jurisdictionName: '   New Hampshire   ',
    state: '   NH   ',
    seal: '\r\n<svg>updated seal</svg>\r\n',
    type: 'primary',
    isMiCombinedBallotPrimary: false,
    date: new DateWithoutTime('2022-01-01'),
    languageCodes: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
  };
  (await apiClient.updateElectionInfo(electionInfoUpdate)).unsafeUnwrap();
  expect(await apiClient.getElectionInfo({ electionId })).toEqual<ElectionInfo>(
    {
      jurisdictionId: nonVxJurisdiction.id,
      electionId,
      title: 'Updated Election',
      jurisdictionName: 'New Hampshire',
      state: 'NH',
      seal: '\r\n<svg>updated seal</svg>\r\n',
      type: 'primary',
      isMiCombinedBallotPrimary: false,
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
      jurisdictionName: 'New Hampshire',
      state: 'NH',
      seal: '\r\n<svg>updated seal</svg>\r\n',
      type: 'primary',
      isMiCombinedBallotPrimary: false,
      date: new DateWithoutTime('2022-01-01'),
      languageCodes: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
    }
  );

  const electionInfoUpdateWithSignature: ElectionInfoUpdate = {
    electionId,
    title: '   Updated Election  ',
    jurisdictionName: '   New Hampshire   ',
    state: '   NH   ',
    seal: '\r\n<svg>updated seal</svg>\r\n',
    type: 'primary',
    isMiCombinedBallotPrimary: false,
    date: new DateWithoutTime('2022-01-01'),
    languageCodes: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
    signatureCaption: 'New Caption',
    signatureImage: '\r\n<svg>new signature</svg>\r\n',
  };
  (
    await apiClient.updateElectionInfo(electionInfoUpdateWithSignature)
  ).unsafeUnwrap();

  // Signature should be included in response
  expect(await apiClient.getElectionInfo({ electionId })).toEqual<ElectionInfo>(
    {
      jurisdictionId: nonVxJurisdiction.id,
      electionId,
      title: 'Updated Election',
      jurisdictionName: 'New Hampshire',
      state: 'NH',
      seal: '\r\n<svg>updated seal</svg>\r\n',
      type: 'primary',
      isMiCombinedBallotPrimary: false,
      date: new DateWithoutTime('2022-01-01'),
      languageCodes: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
      signatureCaption: 'New Caption',
      signatureImage: '\r\n<svg>new signature</svg>\r\n',
    }
  );

  // NhStateBallot also includes the signature in the response
  await apiClient.setBallotTemplate({
    electionId,
    ballotTemplateId: 'NhStateBallot',
  });
  expect(await apiClient.getElectionInfo({ electionId })).toEqual<ElectionInfo>(
    {
      jurisdictionId: nonVxJurisdiction.id,
      electionId,
      title: 'Updated Election',
      jurisdictionName: 'New Hampshire',
      state: 'NH',
      seal: '\r\n<svg>updated seal</svg>\r\n',
      type: 'primary',
      isMiCombinedBallotPrimary: false,
      date: new DateWithoutTime('2022-01-01'),
      languageCodes: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
      signatureCaption: 'New Caption',
      signatureImage: '\r\n<svg>new signature</svg>\r\n',
    }
  );

  // Change to VxDefaultBallot to test signature behavior
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
      jurisdictionName: 'New Hampshire',
      state: 'NH',
      seal: '\r\n<svg>updated seal</svg>\r\n',
      type: 'primary',
      isMiCombinedBallotPrimary: false,
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
        electionId,
        type: 'primary',
        isMiCombinedBallotPrimary: false,
        title: '',
        jurisdictionName: '  ',
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
      newId: 'new-election-id',
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
  const split = precinctWithSplits.splits[0]!;

  (
    await apiClient.updateDistricts({
      electionId,
      deletedDistrictIds: [split.districtIds[0]!],
    })
  ).unsafeUnwrap();

  let updatedPrecincts = await apiClient.listPrecincts({ electionId });
  let updatedPrecinct = updatedPrecincts.find(
    (p) => p.id === precinctWithSplits.id
  )!;
  assert(hasSplits(updatedPrecinct));

  const updatedSplit = updatedPrecinct.splits[0]!;
  expect(updatedSplit.districtIds).not.toContain(split.districtIds[0]);

  // Delete a district associated with a precinct without splits
  const precinctWithoutSplits = updatedPrecincts.find(
    (p) => !hasSplits(p)
  ) as PrecinctWithoutSplits;

  (
    await apiClient.updateDistricts({
      electionId,
      deletedDistrictIds: [precinctWithoutSplits.districtIds[0]!],
    })
  ).unsafeUnwrap();

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
  (
    await apiClient.createPrecinct({
      electionId,
      newPrecinct: precinct1,
    })
  ).unsafeUnwrap();
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
  (
    await apiClient.updateDistricts({
      electionId,
      newDistricts: [district1],
    })
  ).unsafeUnwrap();
  const updatedPrecinct1: PrecinctWithoutSplits = {
    ...precinct1,
    districtIds: [district1.id],
  };
  (
    await apiClient.updatePrecinct({
      electionId,
      updatedPrecinct: updatedPrecinct1,
    })
  ).unsafeUnwrap();
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
  (
    await apiClient.createPrecinct({
      electionId,
      newPrecinct: precinct2,
    })
  ).unsafeUnwrap();
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
  (
    await apiClient.updateDistricts({
      electionId,
      newDistricts: [district2],
    })
  ).unsafeUnwrap();
  const updatedPrecinct2: PrecinctWithSplits = {
    ...precinct2,
    splits: [
      {
        ...precinct2.splits[0]!,
        districtIds: [district2.id],
      },
      precinct2.splits[1]!,
    ],
  };
  (
    await apiClient.updatePrecinct({
      electionId,
      updatedPrecinct: updatedPrecinct2,
    })
  ).unsafeUnwrap();
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
          updatedPrecinct2.splits[0]!,
          {
            ...updatedPrecinct2.splits[1]!,
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
            ...updatedPrecinct2.splits[0]!,
            districtIds: [district1.id],
          },
          {
            ...updatedPrecinct2.splits[1]!,
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

test('registered voter counts are stored and retrieved for precincts and splits', async () => {
  const { apiClient, workspace, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.createElection({
      jurisdictionId: nonVxJurisdiction.id,
      id: unsafeParse(ElectionIdSchema, 'election-rvc'),
    })
  ).unsafeUnwrap();

  const district1: District = {
    id: unsafeParse(DistrictIdSchema, 'district-1'),
    name: 'District 1',
  };
  (
    await apiClient.updateDistricts({ electionId, newDistricts: [district1] })
  ).unsafeUnwrap();

  // Create a precinct without splits with a registered voter count
  const precinct1: PrecinctWithoutSplits = {
    id: 'precinct-1',
    name: 'Precinct 1',
    districtIds: [district1.id],
  };
  (
    await apiClient.createPrecinct({
      electionId,
      newPrecinct: precinct1,
      registeredVoterCounts: 500,
    })
  ).unsafeUnwrap();
  // Verify the initial count is written
  expect(await apiClient.getRegisteredVoterCounts({ electionId })).toEqual({
    'precinct-1': 500,
  });

  // Update the registered voter count
  (
    await apiClient.updatePrecinct({
      electionId,
      updatedPrecinct: precinct1,
      registeredVoterCounts: 750,
    })
  ).unsafeUnwrap();
  // Verify getRegisteredVoterCounts reflects the count
  expect(await apiClient.getRegisteredVoterCounts({ electionId })).toEqual({
    'precinct-1': 750,
  });

  // Create a precinct with splits, each split having a registered voter count
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
  (
    await apiClient.createPrecinct({
      electionId,
      newPrecinct: precinct2,
      registeredVoterCounts: { splits: { 'split-1': 200, 'split-2': 300 } },
    })
  ).unsafeUnwrap();

  // Verify getRegisteredVoterCounts for split precincts
  expect(await workspace.store.getRegisteredVoterCounts(electionId)).toEqual({
    'precinct-1': 750,
    'precinct-2': {
      splits: {
        'split-1': 200,
        'split-2': 300,
      },
    },
  });

  // Update registered voter counts and assert update was written
  await workspace.store.setPrecinctRegisteredVoterCounts(precinct2, {
    splits: { 'split-1': 250, 'split-2': 350 },
  });
  expect(await workspace.store.getRegisteredVoterCounts(electionId)).toEqual({
    'precinct-1': 750,
    'precinct-2': {
      splits: {
        'split-1': 250,
        'split-2': 350,
      },
    },
  });

  // Create a precinct with splits where one split has no registered voter count
  const precinct3: PrecinctWithSplits = {
    id: 'precinct-3',
    name: 'Precinct 3',
    splits: [
      {
        id: 'split-3a',
        name: 'Split 3A',
        districtIds: [district1.id],
      },
      {
        id: 'split-3b',
        name: 'Split 3B',
        districtIds: [],
      },
    ],
  };

  (
    await apiClient.createPrecinct({
      electionId,
      newPrecinct: precinct3,
      registeredVoterCounts: { splits: { 'split-3a': 400 } },
    })
  ).unsafeUnwrap();
  expect(await workspace.store.getRegisteredVoterCounts(electionId)).toEqual({
    'precinct-1': 750,
    'precinct-2': {
      splits: {
        'split-1': 250,
        'split-2': 350,
      },
    },
    'precinct-3': {
      splits: {
        'split-3a': 400,
      },
    },
  });

  // Create a non-split precinct with no voter count - should be omitted from results
  const precinct4: PrecinctWithoutSplits = {
    id: 'precinct-4',
    name: 'Precinct 4',
    districtIds: [],
  };
  (
    await apiClient.createPrecinct({ electionId, newPrecinct: precinct4 })
  ).unsafeUnwrap();

  // Create a split precinct with no voter counts - should be omitted from results
  const precinct5: PrecinctWithSplits = {
    id: 'precinct-5',
    name: 'Precinct 5',
    splits: [
      { id: 'split-5a', name: 'Split 5A', districtIds: [district1.id] },
      { id: 'split-5b', name: 'Split 5B', districtIds: [] },
    ],
  };
  (
    await apiClient.createPrecinct({ electionId, newPrecinct: precinct5 })
  ).unsafeUnwrap();

  // Precincts with no counts should not appear in getRegisteredVoterCounts
  expect(await workspace.store.getRegisteredVoterCounts(electionId)).toEqual({
    'precinct-1': 750,
    'precinct-2': {
      splits: {
        'split-1': 250,
        'split-2': 350,
      },
    },
    'precinct-3': {
      splits: {
        'split-3a': 400,
      },
    },
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
      newId: 'new-election-id',
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

  (
    await apiClient.updateParties({
      electionId,
      deletedPartyIds: [contestWithParty.partyId!],
    })
  ).unsafeUnwrap();

  const updatedContests = await apiClient.listContests({ electionId });
  const updatedContest = updatedContests.find(
    (c) => c.id === contestWithParty.id
  ) as CandidateContest;
  expect(updatedContest.partyId).toBeUndefined();
  expect(
    updatedContest.candidates.every((c) => c.partyIds === undefined)
  ).toEqual(true);
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
  (
    await apiClient.updateDistricts({
      electionId,
      newDistricts: [district1, district2],
    })
  ).unsafeUnwrap();

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
  (
    await apiClient.updateParties({ electionId, newParties: [party1, party2] })
  ).unsafeUnwrap();

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

  (
    await apiClient.createContest({ electionId, newContest: contest1 })
  ).unsafeUnwrap();
  expect(await apiClient.listContests({ electionId })).toEqual([contest1]);

  // Create a ballot measure contest
  const contest2: YesNoContest = {
    id: 'contest-2',
    title: 'Contest 2',
    type: 'yesno',
    districtId: district1.id,
    description: 'Contest 2 Description',
    options: [
      {
        id: 'yes-option',
        label: 'Yes',
      },
      {
        id: 'no-option',
        label: 'No',
      },
    ],
  };
  (
    await apiClient.createContest({ electionId, newContest: contest2 })
  ).unsafeUnwrap();
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

  (
    await apiClient.createContest({ electionId, newContest: contest3 })
  ).unsafeUnwrap();
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
        designation: 'Member of City Council',
      },
    ],
  };
  (
    await apiClient.updateContest({
      electionId,
      updatedContest: updatedContest1,
    })
  ).unsafeUnwrap();
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
  (
    await apiClient.updateContest({
      electionId,
      updatedContest: updatedContest2,
    })
  ).unsafeUnwrap();
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
  (
    await apiClient.createContest({
      electionId,
      newContest: updatedContest1,
    })
  ).unsafeUnwrap();

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
  (
    await apiClient.updateContest({
      electionId,
      updatedContest: {
        ...updatedContest1,
        partyId: party1.id,
      },
    })
  ).unsafeUnwrap();
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
  (
    await apiClient.createContest({
      electionId,
      newContest: {
        ...updatedContest2,
        id: 'contest-7',
        title: 'New Contest Title',
      },
    })
  ).unsafeUnwrap();
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
        options: [
          {
            id: 'dup-yes-option',
            label: 'Yes',
          },
          {
            id: 'dup-no-option',
            label: 'Yes',
          },
        ],
      },
    })
  ).toEqual(err('duplicate-option'));

  // Can't update a ballot measure contest to have duplicate options
  expect(
    await apiClient.updateContest({
      electionId,
      updatedContest: {
        ...contest2,
        options: [
          {
            id: 'dup-yes-option',
            label: 'Yes',
          },
          {
            id: 'dup-no-option',
            label: 'Yes',
          },
        ],
      },
    })
  ).toEqual(err('duplicate-option'));

  // Duplicate labels among additional options (beyond the first two) are also
  // rejected for 3+ option ballot measures
  expect(
    await apiClient.createContest({
      electionId,
      newContest: {
        ...contest2,
        id: 'duplicate-additional-option-contest',
        options: [
          { id: 'opt-yes', label: 'Yes' },
          { id: 'opt-no', label: 'No' },
          { id: 'opt-maybe', label: 'Yes' },
        ],
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

test('candidate designation whitespace is trimmed', async () => {
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

  const district: District = {
    id: unsafeParse(DistrictIdSchema, 'district-1'),
    name: 'District 1',
  };
  (
    await apiClient.updateDistricts({ electionId, newDistricts: [district] })
  ).unsafeUnwrap();

  const candidate: Candidate = {
    id: 'candidate-1',
    firstName: 'Candidate',
    lastName: 'One',
    name: 'Candidate One',
    designation: 'Member of City Council',
  };
  const contest: CandidateContest = {
    id: 'contest-1',
    title: 'Contest 1',
    type: 'candidate',
    seats: 1,
    allowWriteIns: true,
    districtId: district.id,
    candidates: [{ ...candidate, designation: '  Member of City Council  ' }],
  };

  (
    await apiClient.createContest({ electionId, newContest: contest })
  ).unsafeUnwrap();
  expect(await apiClient.listContests({ electionId })).toEqual([
    { ...contest, candidates: [candidate] },
  ]);
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
      newId: 'new-election-id',
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
      writeInInkAreaMm2: 8,
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
            writeInInkAreaMm2: 8,
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
      newId: 'new-election-id',
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents:
          electionFamousNames2021Fixtures.electionJson.asText(),
      },
    })
  ).unsafeUnwrap();

  await addAbsenteePollingPlaceCoveringAllPrecincts(apiClient, electionId);

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

  await apiClient.unfinalizeBallots({ electionId, reason: '' });

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
    await expect(
      apiClient.unfinalizeBallots({ electionId, reason: '' })
    ).rejects.toThrow('auth:forbidden');
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
      newId: 'new-election-id',
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

test('Finalize ballots - allows absentee polling places that cover all precincts', async () => {
  const { apiClient, auth0 } = await setupApp({
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
        electionFileContents: JSON.stringify(
          electionGeneralFixtures.readElection()
        ),
      },
    })
  ).unsafeUnwrap();

  const precincts = await apiClient.listPrecincts({ electionId });
  (
    await apiClient.setPollingPlace({
      electionId,
      place: {
        id: 'absentee-all',
        name: 'Absentee Voting',
        type: 'absentee',
        precincts: Object.fromEntries(
          precincts.map((precinct) => [precinct.id, { type: 'whole' }])
        ),
      },
    })
  ).unsafeUnwrap();

  await apiClient.finalizeBallots({ electionId });
  expect(await apiClient.getBallotsFinalizedAt({ electionId })).not.toEqual(
    null
  );
});

test('Finalize ballots - rejects absentee polling places that do not cover all precincts', async () => {
  const { apiClient, auth0 } = await setupApp({
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
        electionFileContents: JSON.stringify(
          electionGeneralFixtures.readElection()
        ),
      },
    })
  ).unsafeUnwrap();

  // Cover only the first precinct, leaving the others uncovered.
  const precincts = await apiClient.listPrecincts({ electionId });
  expect(precincts.length).toBeGreaterThan(1);
  (
    await apiClient.setPollingPlace({
      electionId,
      place: {
        id: 'absentee-partial',
        name: 'Absentee Voting',
        type: 'absentee',
        precincts: { [precincts[0]!.id]: { type: 'whole' } },
      },
    })
  ).unsafeUnwrap();

  await suppressingConsoleOutput(async () => {
    await expect(apiClient.finalizeBallots({ electionId })).rejects.toThrow(
      'Absentee polling places must cover every precinct for central scanning'
    );
  });
  expect(await apiClient.getBallotsFinalizedAt({ electionId })).toEqual(null);
});

test('Finalize ballots - rejects partial registered voter counts', async () => {
  const { apiClient, auth0 } = await setupApp({
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
        electionFileContents:
          electionFamousNames2021Fixtures.electionJson.asText(),
      },
    })
  ).unsafeUnwrap();

  const precincts = await apiClient.listPrecincts({ electionId });
  // Set a count on only one precinct, leaving the rest without counts
  const firstPrecinct = assertDefined(precincts.find((p) => !hasSplits(p)));
  (
    await apiClient.updatePrecinct({
      electionId,
      updatedPrecinct: firstPrecinct,
      registeredVoterCounts: 500,
    })
  ).unsafeUnwrap();

  await suppressingConsoleOutput(async () => {
    await expect(apiClient.finalizeBallots({ electionId })).rejects.toThrow(
      'Registered voter counts must be provided for all precincts and splits or none'
    );
  });

  // Setting all precincts' counts should allow finalization to proceed
  for (const precinct of precincts) {
    if (!hasSplits(precinct) && precinct.id !== firstPrecinct.id) {
      (
        await apiClient.updatePrecinct({
          electionId,
          updatedPrecinct: precinct,
          registeredVoterCounts: 500,
        })
      ).unsafeUnwrap();
    }
  }

  // This editing state also requires absentee polling place coverage.
  await addAbsenteePollingPlaceCoveringAllPrecincts(apiClient, electionId);

  await apiClient.finalizeBallots({ electionId });
  expect(await apiClient.getBallotsFinalizedAt({ electionId })).not.toEqual(
    null
  );
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
      newId: 'new-election-id',
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

  await addAbsenteePollingPlaceCoveringAllPrecincts(apiClient, electionId);
  await apiClient.finalizeBallots({ electionId });

  {
    const now = new Date();
    vi.useFakeTimers({ now });
    await apiClient.approveBallots({ electionId });
    vi.useRealTimers();
    expect(await apiClient.getBallotsApprovedAt({ electionId })).toEqual(now);
  }

  await apiClient.unfinalizeBallots({ electionId, reason: '' });
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
  (
    await apiClient.loadElection({
      upload: {
        format: 'vxf',
        electionFileContents:
          electionFamousNames2021Fixtures.electionJson.asText(),
      },
      newId: srcElectionId,
      jurisdictionId: nonVxJurisdiction.id,
    })
  ).unsafeUnwrap();
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
  await addAbsenteePollingPlaceCoveringAllPrecincts(apiClient, srcElectionId);
  await apiClient.finalizeBallots({ electionId: srcElectionId });

  // Support user can clone from any jurisdiction to another:
  const newElectionId = await apiClient.cloneElection({
    electionId: srcElectionId,
    destElectionId: 'election-clone-1',
    destJurisdictionId: anotherNonVxJurisdiction.id,
  });
  expect(newElectionId).toEqual('election-clone-1');

  // Ensure cloned election has the same data with new IDs
  const elections = await apiClient.listElections();
  expect(elections[0]!.electionId).toEqual(newElectionId);
  expect(elections[0]!.jurisdictionId).toEqual(anotherNonVxJurisdiction.id);

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
      }
      return {
        ...precinct,
        id: expectNotEqualTo(precinct.id),
        districtIds: precinct.districtIds.map(updatedDistrictId),
      };
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
  function updatedPartyId(srcPartyId?: PartyId): PartyId | undefined {
    if (!srcPartyId) return undefined;
    const srcParty = find(srcParties, (p) => p.id === srcPartyId);
    return find(destParties, (p) => p.name === srcParty.name).id;
  }
  expect(destContests).toEqual(
    srcContests.map((contest) => {
      if (contest.type === 'straight-party') {
        return straightPartyNotYetImplemented();
      }
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
                partyIds: candidate.partyIds
                  ?.map(updatedPartyId)
                  .sort((a, b) => {
                    const aName = destParties.find((p) => p.id === a)?.name;
                    const bName = destParties.find((p) => p.id === b)?.name;
                    assert(typeof aName === 'string', `no party with id: ${a}`);
                    assert(typeof bName === 'string', `no party with id: ${b}`);
                    return aName.localeCompare(bName);
                  }),
              })
            ),
          };
        case 'yesno':
          return {
            ...contest,
            id: expectNotEqualTo(contest.id),
            districtId: updatedDistrictId(contest.districtId),
            options: contest.options.map((option) => ({
              ...option,
              id: expectNotEqualTo(option.id),
            })),
          };
        default:
          throw throwIllegalValue(contest, 'type');
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
      destElectionId: 'election-clone-2',
      destJurisdictionId: nonVxJurisdiction.id,
    })
  ).resolves.toEqual('election-clone-2');

  // Election title has copy prefix if same jurisdiction
  expect(
    (await apiClient.getElectionInfo({ electionId: 'election-clone-2' })).title
  ).toEqual(`(Copy) ${srcElectionInfo.title}`);

  // Can clone a cloned election and get an additional copy prefix
  await expect(
    apiClient.cloneElection({
      electionId: 'election-clone-2',
      destElectionId: 'election-clone-3',
      destJurisdictionId: nonVxJurisdiction.id,
    })
  ).resolves.toEqual('election-clone-3');
  expect(
    (await apiClient.getElectionInfo({ electionId: 'election-clone-3' })).title
  ).toEqual(`(Copy) (Copy) ${srcElectionInfo.title}`);

  // Non-VX user can't clone from another jurisdiction:
  auth0.setLoggedInUser(anotherNonVxUser);
  await suppressingConsoleOutput(() =>
    expect(
      apiClient.cloneElection({
        electionId: srcElectionId,
        destElectionId: 'election-clone-3',
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
        destElectionId: 'election-clone-3',
        destJurisdictionId: anotherNonVxJurisdiction.id,
      })
    ).rejects.toThrow('auth:forbidden')
  );
});

test('combined ballot primary elections', async () => {
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(supportUser);

  // Loading a combined ballot primary into a jurisdiction with COMBINED_BALLOT_PRIMARIES stores the
  // combined-ballot flag
  const electionId = (
    await apiClient.loadElection({
      upload: {
        format: 'vxf',
        electionFileContents:
          electionCombinedBallotPrimaryFixtures.electionJson.asText(),
      },
      newId: 'combined-ballot-primary-election',
      jurisdictionId: miJurisdiction.id,
    })
  ).unsafeUnwrap();
  const combinedBallotPrimaryInfo = await apiClient.getElectionInfo({
    electionId,
  });
  expect(combinedBallotPrimaryInfo.type).toEqual('primary');
  expect(combinedBallotPrimaryInfo.isMiCombinedBallotPrimary).toEqual(true);

  // Combined ballot primary elections generate one ballot style per precinct with no
  // partyId — voters see all parties' contests on a single ballot.
  const combinedBallotPrimaryBallotStyles = await apiClient.listBallotStyles({
    electionId,
  });
  expect(combinedBallotPrimaryBallotStyles.length).toBeGreaterThan(0);
  for (const ballotStyle of combinedBallotPrimaryBallotStyles) {
    expect(ballotStyle.partyId).toBeUndefined();
  }

  // Loading a combined ballot primary into a jurisdiction without COMBINED_BALLOT_PRIMARIES is rejected
  expect(
    await apiClient.loadElection({
      upload: {
        format: 'vxf',
        electionFileContents:
          electionCombinedBallotPrimaryFixtures.electionJson.asText(),
      },
      newId: 'not-combined-ballot-primary-election',
      jurisdictionId: nonVxJurisdiction.id,
    })
  ).toEqual(
    err(
      expect.objectContaining({
        message: expect.stringContaining('Combined ballot primary'),
      })
    )
  );

  // Cloning preserves the combined-ballot flag
  const clonedElectionId = await apiClient.cloneElection({
    electionId,
    destElectionId: 'cloned-combined-ballot-primary',
    destJurisdictionId: miJurisdiction.id,
  });
  const clonedInfo = await apiClient.getElectionInfo({
    electionId: clonedElectionId,
  });
  expect(clonedInfo.type).toEqual('primary');
  expect(clonedInfo.isMiCombinedBallotPrimary).toEqual(true);

  // Cloning a combined ballot primary into a jurisdiction without COMBINED_BALLOT_PRIMARIES is rejected
  await suppressingConsoleOutput(() =>
    expect(
      apiClient.cloneElection({
        electionId,
        destElectionId: 'should-fail',
        destJurisdictionId: nonVxJurisdiction.id,
      })
    ).rejects.toThrow('Combined ballot primary')
  );

  // Finalizing a combined ballot primary generates the election package but skips test
  // decks, which don't yet support combined ballot primaries.
  await addAbsenteePollingPlaceCoveringAllPrecincts(apiClient, electionId);
  const originalMiConfig = stateFeatureConfigs.MI;
  stateFeatureConfigs.MI = { ...originalMiConfig, EXPORT_TEST_BALLOTS: true };
  try {
    await apiClient.finalizeBallots({ electionId });
  } finally {
    stateFeatureConfigs.MI = originalMiConfig;
  }
  expect(
    assertDefined(await apiClient.getElectionPackage({ electionId })).task
  ).toBeDefined();
  expect(await apiClient.getTestDecks({ electionId })).toEqual({});
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
      newId: 'new-election-id',
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
  const split = precinct.splits[0]!;
  const ballotStyle = assertDefined(
    ballotStyles.find(
      (style) =>
        ballotStyleHasPrecinctOrSplit(style, { precinct, split }) &&
        style.languages.includes(LanguageCode.ENGLISH)
    )
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
      newId: 'new-election-id',
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
            style.districts.includes(precinct.districtIds[0]!) &&
            style.languages.includes(LanguageCode.ENGLISH)
        )
      ).id,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
    })
  ).unsafeUnwrap();

  await expect(result.pdfData).toMatchPdfSnapshot({ failureThreshold: 0.01 });
});

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
      newId: 'new-election-id',
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
    ballotPaths: props.map(() => makeTemporaryFile()),
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
    { format: 'vxf', version: LATEST_SOFTWARE_VERSION },
    await apiClient.getSystemSettings({ electionId }),
    ANY_SCRATCH_DIR,
    expect.any(Function) // emitProgress callback
  );
  expect(
    vi.mocked(renderAllBallotPdfsAndCreateElectionDefinition).mock.calls[0]![2]
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
    miJurisdiction,
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
      id: 'vx-election-id',
      jurisdictionId: vxJurisdiction.id,
    })
  ).unsafeUnwrap();
  expect(
    await apiClient.getStateFeatures({ electionId: vxElectionId })
  ).toEqual(stateFeatureConfigs.DEMO);
  expect(
    await apiClient.getSystemSettings({ electionId: vxElectionId })
  ).toEqual(stateDefaultSystemSettings.DEMO);
  expect(
    await apiClient.getBallotTemplate({ electionId: vxElectionId })
  ).toEqual('VxDefaultBallot');

  const sliElectionId = (
    await apiClient.createElection({
      id: 'sli-election-id',
      jurisdictionId: sliJurisdiction.id,
    })
  ).unsafeUnwrap();
  expect(
    await apiClient.getStateFeatures({ electionId: sliElectionId })
  ).toEqual(stateFeatureConfigs.DEMO);
  expect(
    await apiClient.getSystemSettings({ electionId: sliElectionId })
  ).toEqual(SLI_DEFAULT_SYSTEM_SETTINGS);
  expect(
    await apiClient.getBallotTemplate({ electionId: sliElectionId })
  ).toEqual('VxDefaultBallot');

  const nhElectionId = (
    await apiClient.createElection({
      id: 'nh-election-id',
      jurisdictionId: nhJurisdiction.id,
    })
  ).unsafeUnwrap();
  expect(
    await apiClient.getStateFeatures({ electionId: nhElectionId })
  ).toEqual(stateFeatureConfigs.NH);
  expect(
    await apiClient.getSystemSettings({ electionId: nhElectionId })
  ).toEqual(stateDefaultSystemSettings.NH);
  expect(
    await apiClient.getBallotTemplate({ electionId: nhElectionId })
  ).toEqual('NhBallot');

  const msElectionId = (
    await apiClient.createElection({
      id: 'ms-election-id',
      jurisdictionId: msJurisdiction.id,
    })
  ).unsafeUnwrap();
  expect(
    await apiClient.getStateFeatures({ electionId: msElectionId })
  ).toEqual(stateFeatureConfigs.MS);
  expect(
    await apiClient.getSystemSettings({ electionId: msElectionId })
  ).toEqual(stateDefaultSystemSettings.MS);
  expect(
    await apiClient.getBallotTemplate({ electionId: msElectionId })
  ).toEqual('MsBallot');

  const miElectionId = (
    await apiClient.createElection({
      id: 'mi-election-id',
      jurisdictionId: miJurisdiction.id,
    })
  ).unsafeUnwrap();
  expect(
    await apiClient.getStateFeatures({ electionId: miElectionId })
  ).toEqual(stateFeatureConfigs.MI);
  expect(
    await apiClient.getSystemSettings({ electionId: miElectionId })
  ).toEqual(stateDefaultSystemSettings.MI);
  expect(
    await apiClient.getBallotTemplate({ electionId: miElectionId })
  ).toEqual('MiBallot');
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
  (
    await apiClient.createElection({
      id: 'election-id',
      jurisdictionId: vxJurisdiction.id,
    })
  ).unsafeUnwrap();
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
      `s/"@type":"CVR.CVR"/"@type":"CVR.CVR","BallotAuditId":"${i + 1}"/`,
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
