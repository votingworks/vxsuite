import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import JsZip from 'jszip';
import get from 'lodash.get';
import {
  DateWithoutTime,
  assert,
  assertDefined,
  find,
  range,
} from '@votingworks/basics';
import { readFileSync } from 'node:fs';
import {
  electionFamousNames2021Fixtures,
  electionPrimaryPrecinctSplitsFixtures,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import {
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
  ElectionPackageFileName,
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
} from '@votingworks/types';
import {
  getEntries,
  getFeatureFlagMock,
  getFileByName,
  openZip,
  readJsonEntry,
} from '@votingworks/utils';
import {
  forEachUiString,
  isMockCloudSynthesizedSpeech,
  mockCloudTranslatedText,
  readElectionPackageFromBuffer,
} from '@votingworks/backend';
import {
  countObjectLeaves,
  getObjectLeaves,
  suppressingConsoleOutput,
} from '@votingworks/test-utils';
import {
  allBaseBallotProps,
  BallotMode,
  ballotTemplates,
  BaseBallotProps,
  hmpbStringsCatalog,
  renderAllBallotsAndCreateElectionDefinition,
  RenderDocument,
} from '@votingworks/hmpb';
import {
  ELECTION_PACKAGE_FILE_NAME_REGEX,
  exportElectionPackage,
  exportTestDecks,
  processNextBackgroundTaskIfAny,
  testSetupHelpers,
  unzipElectionPackageAndBallots,
} from '../test/helpers';
import { FULL_TEST_DECK_TALLY_REPORT_FILE_NAME } from './test_decks';
import {
  BallotOrderInfo,
  ElectionInfo,
  ElectionListing,
  ElectionStatus,
  Org,
  User,
  convertToVxfBallotStyle,
} from './types';
import { generateBallotStyles } from './ballot_styles';
import { BackgroundTaskMetadata } from './store';
import { join } from 'node:path';
import { electionFeatureConfigs, userFeatureConfigs } from './features';
import { sliOrgId, vxDemosOrgId } from './globals';
import { LogEventId } from '@votingworks/logging';
import { buildApi } from './app';

vi.setConfig({
  testTimeout: 60_000,
});

function expectNotEqualTo(str: string) {
  return expect.not.stringMatching(new RegExp(`^${str}$`));
}

function compareName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name);
}

const vxUser: User = { orgId: 'votingworks', orgName: 'VotingWorks' };
const nonVxUser: User = { orgId: '123', orgName: 'Other Org' };
const anotherNonVxUser = {
  ...nonVxUser,
  orgId: 'another-org-id',
  orgName: 'Another Org',
};
const sliUser: User = { orgId: sliOrgId(), orgName: 'SLI' };
const vxDemosUser: User = { orgId: vxDemosOrgId(), orgName: 'VX Demos' };
const orgs: Org[] = [
  { id: vxUser.orgId, name: 'votingworks', displayName: vxUser.orgName! },
  { id: nonVxUser.orgId, name: 'other', displayName: nonVxUser.orgName! },
  {
    id: anotherNonVxUser.orgId,
    name: 'another',
    displayName: anotherNonVxUser.orgName!,
  },
  { id: sliUser.orgId, name: 'sli', displayName: sliUser.orgName! },
  {
    id: vxDemosUser.orgId,
    name: 'vx-demos',
    displayName: vxDemosUser.orgName!,
  },
];

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
    renderAllBallotsAndCreateElectionDefinition: vi.fn(
      original.renderAllBallotsAndCreateElectionDefinition
    ),
  } as unknown as typeof original;
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
  vi.mocked(renderAllBallotsAndCreateElectionDefinition).mockRestore();
});

test('all methods require authentication', async () => {
  const { apiClient, baseUrl, ...context } = await setupApp();
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
    const response = await fetch(`${baseUrl}/files/some-org-id/some-file-path`);
    expect(response.status).toEqual(500);
    expect(await response.json()).toEqual({ message: 'auth:unauthorized' });
  });
});

test('create/list/delete elections', async () => {
  const { apiClient, auth0 } = await setupApp();
  auth0.setOrgs(orgs);

  auth0.setLoggedInUser(vxUser);
  expect(await apiClient.listElections()).toEqual([]);

  const expectedElectionId = unsafeParse(ElectionIdSchema, 'election-1');
  const electionId = (
    await apiClient.createElection({
      id: expectedElectionId,
      orgId: nonVxUser.orgId,
    })
  ).unsafeUnwrap();
  expect(electionId).toEqual(expectedElectionId);

  const expectedElectionListing: ElectionListing = {
    orgId: nonVxUser.orgId,
    orgName: nonVxUser.orgName!,
    electionId: expectedElectionId,
    title: '',
    date: DateWithoutTime.today(),
    type: 'general',
    jurisdiction: '',
    state: '',
    status: 'notStarted',
  };

  expect(await apiClient.listElections()).toEqual([expectedElectionListing]);
  auth0.setLoggedInUser(nonVxUser);
  expect(await apiClient.listElections()).toEqual([expectedElectionListing]);

  const election2Definition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const election2 = election2Definition.election;

  const importedElectionNewId = 'new-election-id' as ElectionId;
  auth0.setLoggedInUser(vxUser);
  const electionId2 = (
    await apiClient.loadElection({
      newId: importedElectionNewId,
      orgId: vxUser.orgId,
      electionData: election2Definition.electionData,
    })
  ).unsafeUnwrap();
  expect(electionId2).toEqual(importedElectionNewId);

  const expectedElection2Listing: ElectionListing = {
    orgId: vxUser.orgId,
    orgName: vxUser.orgName!,
    electionId: importedElectionNewId,
    title: election2.title,
    date: election2.date,
    type: election2.type,
    jurisdiction: election2.county.name,
    state: election2.state,
    status: 'inProgress',
  };
  expect(await apiClient.listElections()).toEqual([
    expectedElection2Listing,
    expectedElectionListing,
  ]);

  // Permissions should restrict accessing elections across orgs
  auth0.setLoggedInUser(nonVxUser);
  expect(await apiClient.listElections()).toEqual([expectedElectionListing]);
  await suppressingConsoleOutput(async () => {
    await expect(
      apiClient.createElection({ id: 'id', orgId: vxUser.orgId })
    ).rejects.toThrow('auth:forbidden');
    await expect(
      apiClient.deleteElection({ electionId: importedElectionNewId })
    ).rejects.toThrow('auth:forbidden');
  });

  auth0.setLoggedInUser(vxUser);
  await apiClient.deleteElection({ electionId });
  expect(await apiClient.listElections()).toEqual([expectedElection2Listing]);

  // Check that election was loaded correctly
  expect(
    await apiClient.getElectionInfo({ electionId: electionId2 })
  ).toEqual<ElectionInfo>({
    electionId: importedElectionNewId,
    title: election2.title,
    jurisdiction: election2.county.name,
    date: election2.date,
    languageCodes: [LanguageCode.ENGLISH],
    state: election2.state,
    seal: election2.seal,
    type: election2.type,
  });
  const election2Districts = await apiClient.listDistricts({
    electionId: electionId2,
  });
  expect(election2Districts).toEqual(
    election2.districts.map((district) => ({
      ...district,
      id: expectNotEqualTo(district.id),
    }))
  );
  const election2Precincts = await apiClient.listPrecincts({
    electionId: electionId2,
  });
  expect(election2Precincts).toEqual(
    election2.precincts.toSorted(compareName).map((precinct) => ({
      id: expectNotEqualTo(precinct.id),
      name: precinct.name,
      districtIds: [election2Districts[0].id],
    }))
  );
  const election2Parties = await apiClient.listParties({
    electionId: electionId2,
  });
  expect(election2Parties).toEqual(
    election2.parties.toSorted(compareName).map((party) => ({
      ...party,
      id: expectNotEqualTo(party.id),
    }))
  );
  const election2Contests = await apiClient.listContests({
    electionId: electionId2,
  });
  function updatedPartyId(originalPartyId: PartyId) {
    const originalParty = find(
      election2.parties,
      (party) => party.id === originalPartyId
    );
    return find(election2Parties, (party) => party.name === originalParty.name)
      .id;
  }
  expect(election2Contests).toEqual(
    election2.contests.map((contest) => ({
      ...contest,
      id: expectNotEqualTo(contest.id),
      districtId: election2Districts[0].id,
      ...(contest.type === 'candidate'
        ? {
            candidates: contest.candidates.map((candidate) =>
              expect.objectContaining({
                ...candidate,
                id: expectNotEqualTo(candidate.id),
                partyIds: candidate.partyIds?.map(updatedPartyId),
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
  expect(await apiClient.listBallotStyles({ electionId: electionId2 })).toEqual(
    generateBallotStyles({
      ballotLanguageConfigs: [{ languages: [LanguageCode.ENGLISH] }],
      contests: election2Contests,
      electionType: election2.type,
      parties: election2Parties,
      precincts: [...election2Precincts],
    })
  );
  expect(
    await apiClient.getBallotLayoutSettings({ electionId: electionId2 })
  ).toEqual({
    paperSize: election2.ballotLayout.paperSize,
    compact: false,
  });
  expect(
    await apiClient.getSystemSettings({ electionId: electionId2 })
  ).toEqual(DEFAULT_SYSTEM_SETTINGS);
  expect(
    await apiClient.getBallotOrderInfo({ electionId: electionId2 })
  ).toEqual({});
  expect(
    await apiClient.getBallotTemplate({ electionId: electionId2 })
  ).toEqual('VxDefaultBallot');
  expect(
    await apiClient.getBallotsFinalizedAt({ electionId: electionId2 })
  ).toEqual(null);

  // Finalize ballots and check status
  await apiClient.finalizeBallots({ electionId: electionId2 });
  expect((await apiClient.listElections())[0].status).toEqual<ElectionStatus>(
    'ballotsFinalized'
  );

  // Submit ballot order info and check status
  await apiClient.updateBallotOrderInfo({
    electionId: electionId2,
    ballotOrderInfo: {
      absenteeBallotCount: '1',
    },
  });
  expect((await apiClient.listElections())[0].status).toEqual<ElectionStatus>(
    'orderSubmitted'
  );
});

test('update election info', async () => {
  const { apiClient, auth0 } = await setupApp();
  auth0.setLoggedInUser(nonVxUser);

  const electionId = unsafeParse(ElectionIdSchema, 'election-1');
  (
    await apiClient.createElection({
      orgId: nonVxUser.orgId,
      id: electionId,
    })
  ).unsafeUnwrap();

  // Default election info should be blank
  expect(await apiClient.getElectionInfo({ electionId })).toEqual<ElectionInfo>(
    {
      electionId,
      title: '',
      jurisdiction: '',
      state: '',
      seal: '',
      type: 'general',
      date: DateWithoutTime.today(),
      languageCodes: [LanguageCode.ENGLISH],
    }
  );

  // Update election info
  const electionInfoUpdate: ElectionInfo = {
    electionId,
    // trim text values
    title: '   Updated Election  ',
    jurisdiction: '   New Hampshire   ',
    state: '   NH   ',
    seal: '\r\n<svg>updated seal</svg>\r\n',
    type: 'primary',
    date: new DateWithoutTime('2022-01-01'),
    languageCodes: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
  };
  await apiClient.updateElectionInfo(electionInfoUpdate);
  expect(await apiClient.getElectionInfo({ electionId })).toEqual<ElectionInfo>(
    {
      electionId,
      title: 'Updated Election',
      jurisdiction: 'New Hampshire',
      state: 'NH',
      seal: '\r\n<svg>updated seal</svg>\r\n',
      type: 'primary',
      date: new DateWithoutTime('2022-01-01'),
      languageCodes: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
    }
  );

  await suppressingConsoleOutput(async () => {
    // Empty string values are rejected
    await expect(
      apiClient.updateElectionInfo({
        electionId,
        type: 'primary',
        title: '',
        jurisdiction: '  ',
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

test('CRUD districts', async () => {
  const { apiClient, auth0 } = await setupApp();
  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.createElection({
      orgId: nonVxUser.orgId,
      id: unsafeParse(ElectionIdSchema, 'election-1'),
    })
  ).unsafeUnwrap();

  // No districts initially
  expect(await apiClient.listDistricts({ electionId })).toEqual([]);

  // Create a district
  const district1: District = {
    id: unsafeParse(DistrictIdSchema, 'district-1'),
    name: 'District 1',
  };
  await apiClient.createDistrict({
    electionId,
    newDistrict: district1,
  });
  expect(await apiClient.listDistricts({ electionId })).toEqual([district1]);

  // Create another district
  const district2: District = {
    id: unsafeParse(DistrictIdSchema, 'district-2'),
    name: 'District 2',
  };
  await apiClient.createDistrict({
    electionId,
    newDistrict: district2,
  });
  expect(await apiClient.listDistricts({ electionId })).toEqual([
    district1,
    district2,
  ]);

  // Update a district
  const updatedDistrict1: District = {
    ...district1,
    name: 'Updated District 1',
  };
  await apiClient.updateDistrict({
    electionId,
    updatedDistrict: updatedDistrict1,
  });
  // Expect districts to be reordered alphabetically due to name change
  expect(await apiClient.listDistricts({ electionId })).toEqual([
    district2,
    updatedDistrict1,
  ]);

  // Delete a district
  await apiClient.deleteDistrict({
    electionId,
    districtId: district2.id,
  });
  expect(await apiClient.listDistricts({ electionId })).toEqual([
    updatedDistrict1,
  ]);

  await suppressingConsoleOutput(async () => {
    // Try to create an invalid district
    await expect(
      apiClient.createDistrict({
        electionId,
        newDistrict: {
          id: unsafeParse(DistrictIdSchema, 'district-1'),
          name: '',
        },
      })
    ).rejects.toThrow();

    // Try to update a district that doesn't exist
    await expect(
      apiClient.updateDistrict({
        electionId,
        updatedDistrict: {
          ...district1,
          id: unsafeParse(DistrictIdSchema, 'invalid-id'),
        },
      })
    ).rejects.toThrow();

    // Try to delete a district that doesn't exist
    await expect(
      apiClient.deleteDistrict({
        electionId,
        districtId: unsafeParse(DistrictIdSchema, 'invalid-id'),
      })
    ).rejects.toThrow();

    // Check permissions
    auth0.setLoggedInUser(anotherNonVxUser);
    await expect(apiClient.listDistricts({ electionId })).rejects.toThrow(
      'auth:forbidden'
    );
    await expect(
      apiClient.createDistrict({
        electionId,
        newDistrict: district1,
      })
    ).rejects.toThrow('auth:forbidden');
    await expect(
      apiClient.updateDistrict({
        electionId,
        updatedDistrict: updatedDistrict1,
      })
    ).rejects.toThrow('auth:forbidden');
    await expect(
      apiClient.deleteDistrict({
        electionId,
        districtId: updatedDistrict1.id,
      })
    ).rejects.toThrow('auth:forbidden');
  });
});

test('deleting a district updates associated precincts', async () => {
  const baseElectionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  const { apiClient, auth0 } = await setupApp();
  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      orgId: nonVxUser.orgId,
      electionData: baseElectionDefinition.electionData,
    })
  ).unsafeUnwrap();

  // Delete a district associated with a precinct with splits
  const precincts = await apiClient.listPrecincts({ electionId });
  const precinctWithSplits = precincts.find(hasSplits)!;
  const split = precinctWithSplits.splits[0];
  await apiClient.deleteDistrict({
    electionId,
    districtId: split.districtIds[0],
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
  await apiClient.deleteDistrict({
    electionId,
    districtId: precinctWithoutSplits.districtIds[0],
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
  const { apiClient, auth0 } = await setupApp();
  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.createElection({
      orgId: nonVxUser.orgId,
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

  // Add a district to the precinct
  const district1: District = {
    id: unsafeParse(DistrictIdSchema, 'district-1'),
    name: 'District 1',
  };
  await apiClient.createDistrict({
    electionId,
    newDistrict: district1,
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

  // Update splits
  const district2: District = {
    id: unsafeParse(DistrictIdSchema, 'district-2'),
    name: 'District 2',
  };
  await apiClient.createDistrict({
    electionId,
    newDistrict: district2,
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

test('CRUD parties', async () => {
  const { apiClient, auth0 } = await setupApp();
  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.createElection({
      orgId: nonVxUser.orgId,
      id: unsafeParse(ElectionIdSchema, 'election-1'),
    })
  ).unsafeUnwrap();

  // No parties initially
  expect(await apiClient.listParties({ electionId })).toEqual([]);

  // Create a party
  const party1: Party = {
    id: unsafeParse(PartyIdSchema, 'party-1'),
    name: 'Party 1',
    abbrev: 'P1',
    fullName: 'Party 1 Full Name',
  };
  await apiClient.createParty({ electionId, newParty: party1 });
  expect(await apiClient.listParties({ electionId })).toEqual([party1]);

  // Create another party
  const party2: Party = {
    id: unsafeParse(PartyIdSchema, 'party-2'),
    name: 'Party 2',
    abbrev: 'P2',
    fullName: 'Party 2 Full Name',
  };
  await apiClient.createParty({ electionId, newParty: party2 });
  expect(await apiClient.listParties({ electionId })).toEqual([party1, party2]);

  // Update a party
  const updatedParty1: Party = {
    ...party1,
    name: 'Updated Party 1',
    fullName: 'Updated Party 1 Full Name',
  };
  await apiClient.updateParty({ electionId, updatedParty: updatedParty1 });
  // Expect parties to be reordered alphabetically due to name change
  expect(await apiClient.listParties({ electionId })).toEqual([
    party2,
    updatedParty1,
  ]);

  // Delete a party
  await apiClient.deleteParty({ electionId, partyId: party2.id });
  expect(await apiClient.listParties({ electionId })).toEqual([updatedParty1]);

  await suppressingConsoleOutput(async () => {
    // Try to create an invalid party
    await expect(
      apiClient.createParty({
        electionId,
        newParty: {
          id: unsafeParse(PartyIdSchema, 'party-1'),
          name: '',
          abbrev: '',
          fullName: '',
        },
      })
    ).rejects.toThrow();

    // Try to update a party that doesn't exist
    await expect(
      apiClient.updateParty({
        electionId,
        updatedParty: {
          ...party1,
          id: unsafeParse(PartyIdSchema, 'invalid-id'),
        },
      })
    ).rejects.toThrow();

    // Try to delete a party that doesn't exist
    await expect(
      apiClient.deleteParty({
        electionId,
        partyId: unsafeParse(PartyIdSchema, 'invalid-id'),
      })
    ).rejects.toThrow();

    // Check permissions
    auth0.setLoggedInUser(anotherNonVxUser);
    await expect(apiClient.listParties({ electionId })).rejects.toThrow(
      'auth:forbidden'
    );
    await expect(
      apiClient.createParty({
        electionId,
        newParty: party1,
      })
    ).rejects.toThrow('auth:forbidden');
    await expect(
      apiClient.updateParty({
        electionId,
        updatedParty: updatedParty1,
      })
    ).rejects.toThrow('auth:forbidden');
    await expect(
      apiClient.deleteParty({
        electionId,
        partyId: updatedParty1.id,
      })
    ).rejects.toThrow('auth:forbidden');
  });
});

test('deleting a party updates associated contests', async () => {
  const baseElectionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  const { apiClient, auth0 } = await setupApp();
  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      orgId: nonVxUser.orgId,
      electionData: baseElectionDefinition.electionData,
    })
  ).unsafeUnwrap();

  // Delete a party associated with a contest
  const contests = await apiClient.listContests({ electionId });
  const contestWithParty = contests.find(
    (c): c is CandidateContest =>
      c.type === 'candidate' && c.partyId !== undefined
  )!;
  assert(contestWithParty.candidates.every((c) => c.partyIds?.length === 1));
  await apiClient.deleteParty({
    electionId,
    partyId: contestWithParty.partyId!,
  });

  const updatedContests = await apiClient.listContests({ electionId });
  const updatedContest = updatedContests.find(
    (c) => c.id === contestWithParty.id
  ) as CandidateContest;
  expect(updatedContest.partyId).toBeUndefined();
  expect(updatedContest.candidates.every((c) => c.partyIds === undefined));
});

test('CRUD contests', async () => {
  const { apiClient, auth0 } = await setupApp();
  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.createElection({
      orgId: nonVxUser.orgId,
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

  // Create a candidate contest
  const district1: District = {
    id: unsafeParse(DistrictIdSchema, 'district-1'),
    name: 'District 1',
  };
  await apiClient.createDistrict({ electionId, newDistrict: district1 });
  const party1: Party = {
    id: unsafeParse(PartyIdSchema, 'party-1'),
    name: 'Party 1',
    abbrev: 'P1',
    fullName: 'Party 1 Full Name',
  };
  await apiClient.createParty({ electionId, newParty: party1 });
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

  // Update candidate contest
  const updatedContest1: CandidateContest = {
    ...contest1,
    title: 'Updated Contest 1',
    seats: 2,
    allowWriteIns: false,
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
    updatedContest2,
  ]);

  // Delete a contest
  await apiClient.deleteContest({ electionId, contestId: updatedContest1.id });
  expect(await apiClient.listContests({ electionId })).toEqual([
    updatedContest2,
  ]);

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

test('creating/updating contests with candidate rotation', async () => {
  const { apiClient, auth0 } = await setupApp();
  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.createElection({
      orgId: nonVxUser.orgId,
      id: unsafeParse(ElectionIdSchema, 'election-1'),
    })
  ).unsafeUnwrap();
  const election = electionFamousNames2021Fixtures.readElection();
  for (const party of election.parties) {
    await apiClient.createParty({ electionId, newParty: party });
  }
  for (const district of election.districts) {
    await apiClient.createDistrict({ electionId, newDistrict: district });
  }
  let fixtureContest = election.contests.find(
    (c): c is CandidateContest =>
      c.type === 'candidate' && c.candidates.length > 2
  )!;
  expect(fixtureContest.candidates.map((c) => c.name)).toMatchInlineSnapshot(`
[
  "Winston Churchill",
  "Oprah Winfrey",
  "Louis Armstrong",
]
`);
  fixtureContest = {
    ...fixtureContest,
    candidates: fixtureContest.candidates.map((c) => {
      const [firstName, lastName] = c.name.split(' ');
      return { ...c, firstName, lastName };
    }),
  };

  // No rotation should occur for the default ballot template
  await apiClient.setBallotTemplate({
    electionId,
    ballotTemplateId: 'VxDefaultBallot',
  });
  await apiClient.createContest({ electionId, newContest: fixtureContest });
  let contests = await apiClient.listContests({ electionId });
  let contest = contests[0] as CandidateContest;
  expect(contest.candidates).toEqual(fixtureContest.candidates);

  // Update contest with candidate changes (which would trigger rotation if it were enabled for this template)
  const updatedContest: CandidateContest = {
    ...contest,
    candidates: fixtureContest.candidates.toReversed(),
  };
  await apiClient.updateContest({ electionId, updatedContest: updatedContest });
  contests = await apiClient.listContests({ electionId });
  contest = contests[0] as CandidateContest;
  expect(contest.candidates).toEqual(updatedContest.candidates);

  // Switch to the NH ballot template to trigger rotation
  await apiClient.setBallotTemplate({
    electionId,
    ballotTemplateId: 'NhBallot',
  });

  // Create the contest again, this time rotation should occur
  await apiClient.deleteContest({ electionId, contestId: contest.id });
  await apiClient.createContest({ electionId, newContest: fixtureContest });
  contests = await apiClient.listContests({ electionId });
  contest = contests[0] as CandidateContest;
  // Rotation logic is tested in candidate_rotation.test.ts
  // Here we just want to make sure that rotation occurred.
  expect(contest.candidates).not.toEqual(fixtureContest.candidates);
  expect(contest.candidates.length).toEqual(fixtureContest.candidates.length);
  expect(new Set(contest.candidates)).toEqual(
    new Set(fixtureContest.candidates)
  );
  expect(contest.candidates.map((c) => c.name)).toMatchInlineSnapshot(`
[
  "Louis Armstrong",
  "Winston Churchill",
  "Oprah Winfrey",
]
`);

  // Update contest with no changes just to trigger candidate rotation
  await apiClient.updateContest({ electionId, updatedContest: updatedContest });
  contests = await apiClient.listContests({ electionId });
  contest = contests[0] as CandidateContest;
  expect(contest.candidates).not.toEqual(updatedContest.candidates);
  expect(contest.candidates.length).toEqual(updatedContest.candidates.length);
  expect(new Set(contest.candidates)).toEqual(
    new Set(updatedContest.candidates)
  );
  expect(contest.candidates.map((c) => c.name)).toMatchInlineSnapshot(`
[
  "Louis Armstrong",
  "Winston Churchill",
  "Oprah Winfrey",
]
`);
});

test('reordering contests', async () => {
  const { apiClient, auth0 } = await setupApp();
  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      orgId: nonVxUser.orgId,
      electionData: electionFamousNames2021Fixtures.electionJson.asText(),
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
  const { apiClient, auth0 } = await setupApp();
  auth0.setLoggedInUser(nonVxUser);
  const electionId = unsafeParse(ElectionIdSchema, 'election-1');
  (
    await apiClient.createElection({
      orgId: nonVxUser.orgId,
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
  const { apiClient, auth0 } = await setupApp();
  auth0.setLoggedInUser(nonVxUser);
  const electionId = unsafeParse(ElectionIdSchema, 'election-1');
  (
    await apiClient.createElection({
      orgId: nonVxUser.orgId,
      id: electionId,
    })
  ).unsafeUnwrap();

  // Default system settings
  expect(await apiClient.getSystemSettings({ electionId })).toEqual(
    DEFAULT_SYSTEM_SETTINGS
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

test('get/update ballot order info', async () => {
  const { apiClient, auth0 } = await setupApp();
  auth0.setLoggedInUser(nonVxUser);
  const electionId = unsafeParse(ElectionIdSchema, 'election-1');
  (
    await apiClient.createElection({
      orgId: nonVxUser.orgId,
      id: electionId,
    })
  ).unsafeUnwrap();

  // Empty ballot order info initially
  expect(await apiClient.getBallotOrderInfo({ electionId })).toEqual({});

  // Update ballot order info
  const updatedBallotOrderInfo: BallotOrderInfo = {
    absenteeBallotCount: '100',
    deliveryAddress: '123 Main St, Town, NH, 00000',
    deliveryRecipientName: 'Clerky Clerkson',
    ballotColor: 'Yellow for town, white for school',
    precinctBallotCount: '200',
    shouldAbsenteeBallotsBeScoredForFolding: true,
  };
  await apiClient.updateBallotOrderInfo({
    electionId,
    ballotOrderInfo: updatedBallotOrderInfo,
  });
  expect(await apiClient.getBallotOrderInfo({ electionId })).toEqual(
    updatedBallotOrderInfo
  );

  await suppressingConsoleOutput(async () => {
    // Try to update with invalid values
    await expect(
      apiClient.updateBallotOrderInfo({
        electionId,
        ballotOrderInfo: {
          ...updatedBallotOrderInfo,
          absenteeBallotCount: 1 as unknown as string,
        },
      })
    ).rejects.toThrow();

    // Check permissions
    auth0.setLoggedInUser(anotherNonVxUser);
    await expect(apiClient.getBallotOrderInfo({ electionId })).rejects.toThrow(
      'auth:forbidden'
    );
    await expect(
      apiClient.updateBallotOrderInfo({
        electionId,
        ballotOrderInfo: updatedBallotOrderInfo,
      })
    ).rejects.toThrow('auth:forbidden');
  });
});

test('Finalize ballots', async () => {
  const { apiClient, auth0 } = await setupApp();
  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      orgId: nonVxUser.orgId,
      electionData: electionFamousNames2021Fixtures.electionJson.asText(),
    })
  ).unsafeUnwrap();

  expect(await apiClient.getBallotsFinalizedAt({ electionId })).toEqual(null);

  const finalizedAt = new Date();
  vi.useFakeTimers({ now: finalizedAt });
  await apiClient.finalizeBallots({ electionId });
  expect(await apiClient.getBallotsFinalizedAt({ electionId })).toEqual(
    finalizedAt
  );
  vi.useRealTimers();

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

test('cloneElection', async () => {
  const { apiClient, auth0 } = await setupApp();

  const srcElectionId = 'election-1' as ElectionId;
  const nonDefaultSystemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    auth: {
      ...DEFAULT_SYSTEM_SETTINGS.auth,
      arePollWorkerCardPinsEnabled: true,
    },
  };

  auth0.setLoggedInUser(vxUser);
  await apiClient.loadElection({
    electionData: electionFamousNames2021Fixtures.electionJson.asText(),
    newId: srcElectionId,
    orgId: nonVxUser.orgId,
  });
  await apiClient.updateSystemSettings({
    electionId: srcElectionId,
    systemSettings: nonDefaultSystemSettings,
  });
  await apiClient.setBallotTemplate({
    electionId: srcElectionId,
    ballotTemplateId: 'VxDefaultBallot',
  });
  await apiClient.finalizeBallots({ electionId: srcElectionId });

  // Vx user can clone from any org to another:
  const newElectionId = await apiClient.cloneElection({
    electionId: srcElectionId,
    destElectionId: 'election-clone-1' as ElectionId,
    destOrgId: 'dest-org-id',
  });
  expect(newElectionId).toEqual('election-clone-1');

  // Ensure cloned election has the same data with new IDs
  const elections = await apiClient.listElections();
  expect(elections[0].electionId).toEqual('election-clone-1');
  expect(elections[0].orgId).toEqual('dest-org-id');

  const srcElectionInfo = await apiClient.getElectionInfo({
    electionId: srcElectionId,
  });
  const destElectionInfo = await apiClient.getElectionInfo({
    electionId: newElectionId,
  });
  expect(destElectionInfo).toEqual({
    ...srcElectionInfo,
    electionId: newElectionId,
    title: `(Copy) ${srcElectionInfo.title}`,
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
            candidates: contest.candidates.map((candidate) => ({
              ...candidate,
              id: expectNotEqualTo(candidate.id),
              partyIds: candidate.partyIds?.map(updatedPartyId),
            })),
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

  expect(
    await apiClient.getSystemSettings({ electionId: newElectionId })
  ).toEqual(nonDefaultSystemSettings);
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
  expect(
    await apiClient.getBallotOrderInfo({ electionId: newElectionId })
  ).toEqual({});

  // Non-Vx user can clone from and to their own org:
  auth0.setLoggedInUser(nonVxUser);
  await expect(
    apiClient.cloneElection({
      electionId: srcElectionId,
      destElectionId: 'election-clone-2' as ElectionId,
      destOrgId: nonVxUser.orgId,
    })
  ).resolves.toEqual('election-clone-2');

  // Non-VX user can't clone from another org:
  auth0.setLoggedInUser(anotherNonVxUser);
  await suppressingConsoleOutput(() =>
    expect(
      apiClient.cloneElection({
        electionId: srcElectionId,
        destElectionId: 'election-clone-3' as ElectionId,
        destOrgId: nonVxUser.orgId,
      })
    ).rejects.toThrow('auth:forbidden')
  );

  // Non-VX user can't clone from their org to another:
  auth0.setLoggedInUser(nonVxUser);
  await suppressingConsoleOutput(() =>
    expect(
      apiClient.cloneElection({
        electionId: srcElectionId,
        destElectionId: 'election-clone-3' as ElectionId,
        destOrgId: anotherNonVxUser.orgId,
      })
    ).rejects.toThrow('auth:forbidden')
  );
});

test('Election package management', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { apiClient, workspace, fileStorageClient, auth0, baseUrl } =
    await setupApp();

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      orgId: nonVxUser.orgId,
      electionData: baseElectionDefinition.electionData,
    })
  ).unsafeUnwrap();

  // Mock the ballot documents and election definition to speed up this test,
  // since we are just testing the export task flows in this test. The next test
  // checks the actual exported data.
  const props = allBaseBallotProps(baseElectionDefinition.election);
  vi.mocked(renderAllBallotsAndCreateElectionDefinition).mockResolvedValue({
    ballotDocuments: props.map(mockBallotDocument),
    electionDefinition: baseElectionDefinition,
  });

  const electionPackageBeforeExport = await apiClient.getElectionPackage({
    electionId,
  });
  expect(electionPackageBeforeExport).toEqual({});

  // Initiate an export
  await apiClient.exportElectionPackage({
    electionId,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
  });
  const expectedPayload = JSON.stringify({
    electionId,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
  });
  const electionPackageAfterInitiatingExport =
    await apiClient.getElectionPackage({ electionId });
  expect(electionPackageAfterInitiatingExport).toEqual<BackgroundTaskMetadata>({
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
  });
  const electionPackageAfterInitiatingRedundantExport =
    await apiClient.getElectionPackage({ electionId });
  expect(electionPackageAfterInitiatingRedundantExport).toEqual(
    electionPackageAfterInitiatingExport
  );

  // Complete an export
  await processNextBackgroundTaskIfAny({ fileStorageClient, workspace });
  const electionPackageAfterExport = await apiClient.getElectionPackage({
    electionId,
  });
  expect(electionPackageAfterExport).toEqual<BackgroundTaskMetadata>({
    task: {
      completedAt: expect.any(Date),
      createdAt: expect.any(Date),
      id: taskId,
      payload: expectedPayload,
      startedAt: expect.any(Date),
      taskName: 'generate_election_package',
    },
    url: expect.stringMatching(ELECTION_PACKAGE_FILE_NAME_REGEX),
  });
  expect(electionPackageAfterExport.url).toContain(nonVxUser.orgId);

  // Check that the correct package was returned by the files API endpoint
  const electionPackageUrl = `${baseUrl}${electionPackageAfterExport.url}`;
  const response = await fetch(electionPackageUrl);
  const body = Buffer.from(await response.arrayBuffer());
  const { electionPackageFileName } =
    await unzipElectionPackageAndBallots(body);
  const electionHashes = electionPackageFileName.match(
    /^election-package-(.+)\.zip$/
  )![1];
  expect(electionPackageAfterExport.url).toContain(electionHashes);

  // Check that other org users can't access the package
  await suppressingConsoleOutput(async () => {
    auth0.setLoggedInUser(anotherNonVxUser);
    const otherOrgResponse = await fetch(electionPackageUrl);
    expect(otherOrgResponse.status).toEqual(500);
    expect(await otherOrgResponse.json()).toEqual({
      message: 'auth:forbidden',
    });
  });

  // Check that initiating an export after a prior has completed does trigger a new background task
  auth0.setLoggedInUser(nonVxUser);
  await apiClient.exportElectionPackage({
    electionId,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
  });
  const electionPackageAfterInitiatingSecondExport =
    await apiClient.getElectionPackage({ electionId });
  expect(
    electionPackageAfterInitiatingSecondExport
  ).toEqual<BackgroundTaskMetadata>({
    task: {
      createdAt: expect.any(Date),
      id: expect.any(String),
      payload: expectedPayload,
      taskName: 'generate_election_package',
    },
    url: expect.stringMatching(ELECTION_PACKAGE_FILE_NAME_REGEX),
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
  const { apiClient, workspace, fileStorageClient, auth0 } = await setupApp();

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      orgId: nonVxUser.orgId,
      electionData: JSON.stringify(electionWithLegalPaper),
    })
  ).unsafeUnwrap();
  await apiClient.updateSystemSettings({
    electionId,
    systemSettings: mockSystemSettings,
  });
  const electionInfo = await apiClient.getElectionInfo({ electionId });
  const ballotStyles = await apiClient.listBallotStyles({ electionId });

  const electionPackageFilePath = await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: true,
  });
  const contents = assertDefined(
    fileStorageClient.getRawFile(join(nonVxUser.orgId, electionPackageFilePath))
  );
  const { electionPackageContents, ballotsContents } =
    await unzipElectionPackageAndBallots(contents);
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
  } = electionPackage;
  assert(metadata !== undefined);
  assert(systemSettings !== undefined);
  assert(uiStringAudioClips !== undefined);
  assert(uiStringAudioIds !== undefined);
  assert(uiStrings !== undefined);

  const [, ballotHashFromFileName, electionPackageHashFromFileName] =
    electionPackageFilePath.match(ELECTION_PACKAGE_FILE_NAME_REGEX)!;
  expect(electionPackageHashFromFileName).toEqual(
    formatElectionPackageHash(electionPackageHash)
  );
  expect(ballotHashFromFileName).toEqual(
    formatBallotHash(electionDefinition.ballotHash)
  );

  //
  // Check metadata
  //

  expect(metadata.version).toEqual('latest');

  //
  // Check election definition
  //
  const expectedBallotStyles = ballotStyles.map(convertToVxfBallotStyle);
  const expectedElectionWithoutBallotStrings: Election = {
    ...electionWithLegalPaper,
    id: electionId,
    // Ballot styles are generated in the app, ignoring the ones in the inputted election
    // definition
    ballotStyles: expectedBallotStyles,

    // Include entities with IDs generated by VxDesign
    districts: await apiClient.listDistricts({ electionId }),
    precincts: await apiClient.listPrecincts({ electionId }),
    parties: await apiClient.listParties({ electionId }),
    contests: await apiClient.listContests({ electionId }),
    county: {
      ...electionWithLegalPaper.county,
      id: `${electionId}-county`,
    },

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
      ballotStyles: expectedBallotStyles,
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
  const zip = await JsZip.loadAsync(new Uint8Array(ballotsContents));

  const expectedFileNames = [
    ...ballotStyles
      .flatMap(({ id, precinctsOrSplits }) =>
        precinctsOrSplits.map((p) => ({
          ballotStyleId: id,
          precinctId: p.precinctId,
        }))
      )
      .flatMap(({ ballotStyleId, precinctId }) => {
        const precinctName = find(
          electionDefinition.election.precincts,
          (p) => p.id === precinctId
        ).name.replaceAll(' ', '_');

        const suffix = `ballot-${precinctName}-${ballotStyleId}.pdf`;

        return [
          `official-precinct-${suffix}`,
          `test-precinct-${suffix}`,
          `sample-precinct-${suffix}`,
          `official-absentee-${suffix}`,
          `test-absentee-${suffix}`,
          `sample-absentee-${suffix}`,
        ];
      }),
  ].sort();
  expect(Object.keys(zip.files).sort()).toEqual(expectedFileNames);

  // Ballot appearance is tested by fixtures in libs/hmpb, so we
  // just make sure we got a PDF and that we called the layout function with the
  // right arguments.
  for (const file of Object.values(zip.files)) {
    expect(await file.async('text')).toContain('%PDF');
  }
  expect(renderAllBallotsAndCreateElectionDefinition).toHaveBeenCalledTimes(1);
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
  expect(renderAllBallotsAndCreateElectionDefinition).toHaveBeenCalledWith(
    expect.any(Object), // Renderer
    ballotTemplates.VxDefaultBallot,
    expectedBallotProps,
    'vxf'
  );
});

test('Export test decks', async () => {
  const electionDefinition = readElectionTwoPartyPrimaryDefinition();
  const { apiClient, fileStorageClient, workspace, auth0 } = await setupApp();

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      orgId: nonVxUser.orgId,
      electionData: electionDefinition.electionData,
    })
  ).unsafeUnwrap();

  const filename = await exportTestDecks({
    apiClient,
    electionId,
    fileStorageClient,
    workspace,
    electionSerializationFormat: 'vxf',
  });

  const filepath = join(nonVxUser.orgId, filename);
  const zipContents = assertDefined(
    fileStorageClient.getRawFile(filepath),
    `No file found in mock FileStorageClient for ${filepath}`
  );
  const zip = await JsZip.loadAsync(new Uint8Array(zipContents));

  const ballotStyles = await apiClient.listBallotStyles({ electionId });
  const precincts = await apiClient.listPrecincts({ electionId });
  const precinctsWithBallots = precincts.filter((precinct) =>
    ballotStyles.some((ballotStyle) =>
      ballotStyle.precinctsOrSplits.some((p) => p.precinctId === precinct.id)
    )
  );
  expect(Object.keys(zip.files).sort()).toEqual(
    [
      ...precinctsWithBallots.map(
        (precinct) => `${precinct.name.replaceAll(' ', '_')}-test-ballots.pdf`
      ),
      FULL_TEST_DECK_TALLY_REPORT_FILE_NAME,
    ].sort()
  );

  // We test the actual test deck content in test_decks.ts
  for (const file of Object.values(zip.files)) {
    expect(await file.async('text')).toContain('%PDF');
  }
  expect(renderAllBallotsAndCreateElectionDefinition).toHaveBeenCalledTimes(1);
  const expectedBallotProps = ballotStyles.flatMap((ballotStyle) =>
    ballotStyle.precinctsOrSplits.map(({ precinctId }) => ({
      election: expect.objectContaining({ id: electionId }),
      ballotStyleId: ballotStyle.id,
      precinctId,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
      compact: false,
    }))
  );
  expect(renderAllBallotsAndCreateElectionDefinition).toHaveBeenCalledWith(
    expect.any(Object), // Renderer
    ballotTemplates.VxDefaultBallot,
    expectedBallotProps,
    'vxf'
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

test('Consistency of ballot hash across exports', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { apiClient, workspace, fileStorageClient, auth0 } = await setupApp();

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      orgId: nonVxUser.orgId,
      electionData: baseElectionDefinition.electionData,
    })
  ).unsafeUnwrap();

  const testDecksFilePath = await exportTestDecks({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
  });

  const electionPackageAndBallotsFilePath = await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
  });
  const contents = assertDefined(
    fileStorageClient.getRawFile(
      join(nonVxUser.orgId, electionPackageAndBallotsFilePath)
    )
  );
  const { electionPackageContents, electionPackageFileName, ballotsFileName } =
    await unzipElectionPackageAndBallots(contents);
  const { electionDefinition } = (
    await readElectionPackageFromBuffer(electionPackageContents)
  ).unsafeUnwrap().electionPackage;
  const electionPackageZipBallotHash = electionPackageFileName.match(
    'election-package-(.*)-.*.zip'
  )![1];
  const ballotsZipBallotHash = ballotsFileName.match('ballots-(.*).zip')![1];
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
  const { apiClient, workspace, fileStorageClient, auth0 } = await setupApp();

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      orgId: nonVxUser.orgId,
      electionData: baseElectionDefinition.electionData,
    })
  ).unsafeUnwrap();

  const testDecksFilePath = await exportTestDecks({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'cdf',
  });

  const electionPackageAndBallotsFilePath = await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'cdf',
    shouldExportAudio: false,
  });
  const contents = assertDefined(
    fileStorageClient.getRawFile(
      join(nonVxUser.orgId, electionPackageAndBallotsFilePath)
    )
  );
  const { electionPackageContents } =
    await unzipElectionPackageAndBallots(contents);
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
  const { apiClient, workspace, fileStorageClient, auth0 } = await setupApp();

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      orgId: nonVxUser.orgId,
      electionData: baseElectionDefinition.electionData,
    })
  ).unsafeUnwrap();

  const numAuditIdBallots = 3;
  const electionPackageFilePath = await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: true,
    numAuditIdBallots,
  });
  const contents = assertDefined(
    fileStorageClient.getRawFile(join(nonVxUser.orgId, electionPackageFilePath))
  );
  const { electionPackageContents, ballotsContents } =
    await unzipElectionPackageAndBallots(contents);
  const zip = await JsZip.loadAsync(new Uint8Array(ballotsContents));
  expect(Object.keys(zip.files)).toHaveLength(numAuditIdBallots);
  expect(Object.keys(zip.files).sort()).toEqual([
    'official-precinct-ballot-East_Lincoln-1_en-1.pdf',
    'official-precinct-ballot-East_Lincoln-1_en-2.pdf',
    'official-precinct-ballot-East_Lincoln-1_en-3.pdf',
  ]);
  expect(renderAllBallotsAndCreateElectionDefinition).toHaveBeenCalledTimes(1);
  const ballotStyles = await apiClient.listBallotStyles({ electionId });
  const expectedBallotProps = range(1, numAuditIdBallots + 1).map(
    (i): BaseBallotProps => ({
      ballotStyleId: ballotStyles[0].id,
      precinctId: ballotStyles[0].precinctsOrSplits[0].precinctId,
      ballotType: BallotType.Precinct,
      ballotMode: 'official',
      election: expect.any(Object),
      ballotAuditId: String(i),
      compact: false,
    })
  );
  expect(renderAllBallotsAndCreateElectionDefinition).toHaveBeenCalledWith(
    expect.any(Object), // Renderer
    ballotTemplates.VxDefaultBallot,
    expectedBallotProps,
    'vxf'
  );
});

test('getBallotPreviewPdf returns a ballot pdf for precinct with splits', async () => {
  const baseElectionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  const { apiClient, auth0 } = await setupApp();

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      orgId: nonVxUser.orgId,
      electionData: baseElectionDefinition.electionData,
    })
  ).unsafeUnwrap();
  const ballotStyles = await apiClient.listBallotStyles({ electionId });
  const precincts = await apiClient.listPrecincts({ electionId });

  const precinct = assertDefined(precincts.find((p) => hasSplits(p)));
  const split = precinct.splits[0];
  const ballotStyle = assertDefined(
    ballotStyles.find((style) => {
      const matchingSplit = style.precinctsOrSplits.find(
        (p) => p.precinctId === precinct.id && p.splitId === split.id
      );
      return !!matchingSplit && style.languages.includes(LanguageCode.ENGLISH);
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
  };
  const { apiClient, auth0 } = await setupApp();

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      orgId: nonVxUser.orgId,
      electionData: JSON.stringify(election),
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
      const matchingSplit = style.precinctsOrSplits.find(
        (p) => p.precinctId === precinct.id && p.splitId === split.id
      );
      return !!matchingSplit && style.languages.includes(LanguageCode.ENGLISH);
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
  const { apiClient, auth0 } = await setupApp();

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      orgId: nonVxUser.orgId,
      electionData: baseElectionDefinition.electionData,
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
            style.districtIds.includes(precinct.districtIds[0]) &&
            style.languages.includes(LanguageCode.ENGLISH)
        )
      ).id,
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
    })
  ).unsafeUnwrap();

  await expect(result.pdfData).toMatchPdfSnapshot({ failureThreshold: 0.01 });
});

function mockBallotDocument(): RenderDocument {
  return {
    getContent: vi.fn(),
    inspectElements: vi.fn(),
    renderToPdf: vi.fn().mockResolvedValue(Buffer.from('')),
    setContent: vi.fn(),
  };
}

test('setBallotTemplate changes the ballot template used to render ballots', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { apiClient, fileStorageClient, workspace, auth0 } = await setupApp();
  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      orgId: nonVxUser.orgId,
      electionData: electionDefinition.electionData,
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
  vi.mocked(renderAllBallotsAndCreateElectionDefinition).mockResolvedValue({
    ballotDocuments: props.map(mockBallotDocument),
    electionDefinition,
  });
  await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
  });
  expect(renderAllBallotsAndCreateElectionDefinition).toHaveBeenCalledWith(
    expect.any(Object), // Renderer
    ballotTemplates.NhBallot,
    expect.any(Array), // Ballot props
    'vxf'
  );
  expect(
    vi.mocked(renderAllBallotsAndCreateElectionDefinition).mock.calls[0][2]
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

test('v3-compatible election package', async () => {
  const fixtureElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const fixtureElection = fixtureElectionDefinition.election;
  const { apiClient, workspace, fileStorageClient, auth0 } = await setupApp();
  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.loadElection({
      newId: 'new-election-id' as ElectionId,
      orgId: nonVxUser.orgId,
      electionData: fixtureElectionDefinition.electionData,
    })
  ).unsafeUnwrap();
  await apiClient.setBallotTemplate({
    electionId,
    ballotTemplateId: 'NhBallotV3',
  });

  const electionPackageAndBallotsFileName = await exportElectionPackage({
    fileStorageClient,
    apiClient,
    electionId,
    workspace,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
  });
  const electionPackageAndBallotsZip = await openZip(
    new Uint8Array(
      fileStorageClient.getRawFile(
        join(nonVxUser.orgId, electionPackageAndBallotsFileName)
      )!
    )
  );
  const electionPackageAndBallotsZipEntries = getEntries(
    electionPackageAndBallotsZip
  );
  const electionPackageZipBuffer = await find(
    electionPackageAndBallotsZipEntries,
    (entry) => entry.name.startsWith('election-package')
  ).async('nodebuffer');
  const electionPackageZip = await openZip(
    new Uint8Array(electionPackageZipBuffer)
  );
  const electionPackageZipEntries = getEntries(electionPackageZip);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const election: any = await readJsonEntry(
    getFileByName(electionPackageZipEntries, ElectionPackageFileName.ELECTION)
  );
  // Date should be off-by-one to account for timezone bug in v3
  expect(fixtureElection.date.toISOString()).toEqual('2021-06-06');
  expect(election.date).toEqual('2021-06-07');

  // System settings should have field names matching v3 format
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const systemSettings: any = await readJsonEntry(
    getFileByName(
      electionPackageZipEntries,
      ElectionPackageFileName.SYSTEM_SETTINGS
    )
  );
  expect(Object.keys(systemSettings)).toEqual([
    'auth',
    'markThresholds',
    'adminAdjudicationReasons',
    'centralScanAdjudicationReasons',
    'precinctScanAdjudicationReasons',
    'precinctScanDisallowCastingOvervotes',
  ]);

  // No other files included
  expect(electionPackageAndBallotsZipEntries.length).toEqual(2);
});

test('getUser', async () => {
  const { apiClient, auth0 } = await setupApp();
  await suppressingConsoleOutput(() =>
    expect(apiClient.getUser()).rejects.toThrow('auth:unauthorized')
  );
  auth0.setLoggedInUser(vxUser);
  expect(await apiClient.getUser()).toEqual(vxUser);
  auth0.setLoggedInUser(nonVxUser);
  expect(await apiClient.getUser()).toEqual(nonVxUser);
});

test('getAllOrgs', async () => {
  const { apiClient, auth0 } = await setupApp();
  await suppressingConsoleOutput(() =>
    expect(apiClient.getAllOrgs()).rejects.toThrow('auth:unauthorized')
  );
  auth0.setOrgs(orgs);
  auth0.setLoggedInUser(vxUser);
  expect(await apiClient.getAllOrgs()).toEqual(orgs);
  auth0.setLoggedInUser(nonVxUser);
  await suppressingConsoleOutput(() =>
    expect(apiClient.getAllOrgs()).rejects.toThrow('auth:forbidden')
  );
  auth0.setLoggedInUser(sliUser);
  await suppressingConsoleOutput(() =>
    expect(apiClient.getAllOrgs()).rejects.toThrow('auth:forbidden')
  );
  auth0.setLoggedInUser(vxDemosUser);
  await suppressingConsoleOutput(() =>
    expect(apiClient.getAllOrgs()).rejects.toThrow('auth:forbidden')
  );
});

test('feature configs', async () => {
  const { apiClient, auth0 } = await setupApp();
  auth0.setLoggedInUser(vxUser);
  expect(await apiClient.getUserFeatures()).toEqual(userFeatureConfigs.vx);
  auth0.setLoggedInUser(nonVxUser);
  expect(await apiClient.getUserFeatures()).toEqual(userFeatureConfigs.nh);
  auth0.setLoggedInUser(sliUser);
  expect(await apiClient.getUserFeatures()).toEqual(userFeatureConfigs.sli);
  auth0.setLoggedInUser(vxDemosUser);
  expect(await apiClient.getUserFeatures()).toEqual(userFeatureConfigs.demos);

  auth0.setLoggedInUser(vxUser);
  const vxElectionId = (
    await apiClient.createElection({
      id: 'vx-election-id' as ElectionId,
      orgId: vxUser.orgId,
    })
  ).unsafeUnwrap();
  const nonVxElectionId = (
    await apiClient.createElection({
      id: 'non-vx-election-id' as ElectionId,
      orgId: nonVxUser.orgId,
    })
  ).unsafeUnwrap();
  const sliElectionId = (
    await apiClient.createElection({
      id: 'sli-election-id' as ElectionId,
      orgId: sliUser.orgId,
    })
  ).unsafeUnwrap();
  const vxDemosElectionId = (
    await apiClient.createElection({
      id: 'vx-demos-election-id' as ElectionId,
      orgId: vxDemosUser.orgId,
    })
  ).unsafeUnwrap();
  expect(
    await apiClient.getElectionFeatures({ electionId: vxElectionId })
  ).toEqual(electionFeatureConfigs.vx);
  expect(
    await apiClient.getElectionFeatures({ electionId: nonVxElectionId })
  ).toEqual(electionFeatureConfigs.nh);
  expect(
    await apiClient.getElectionFeatures({ electionId: sliElectionId })
  ).toEqual(electionFeatureConfigs.sli);
  expect(
    await apiClient.getElectionFeatures({ electionId: vxDemosElectionId })
  ).toEqual(electionFeatureConfigs.vx);
});

test('api method logging', async () => {
  const { apiClient, logger, auth0 } = await setupApp();
  auth0.setLoggedInUser(vxUser);
  await apiClient.createElection({
    id: 'election-id' as ElectionId,
    orgId: vxUser.orgId,
  });
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ApiCall,
    'system',
    expect.objectContaining({
      methodName: 'createElection',
      input: JSON.stringify({
        id: 'election-id',
        orgId: vxUser.orgId,
      }),
      userOrgId: vxUser.orgId,
    })
  );
});
