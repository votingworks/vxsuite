import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { basename, dirname, join } from 'node:path';
import {
  createElectionPackageZipArchive,
  readElectionPackageFromFile,
} from '@votingworks/backend';
import {
  assert,
  assertDefined,
  DateWithoutTime,
  deferred,
  err,
  ok,
} from '@votingworks/basics';
import {
  type ElectionInfoUpdate,
  type ElectionPackageAndBallotsOutput,
  getStateFeaturesConfig,
  renderElectionPackageAndBallots,
  stateDefaultSystemSettings,
  stateFeatureConfigs,
} from '@votingworks/election-definition-backend';
import { describeElectionDefinitionMethods } from '@votingworks/election-definition-backend/test-utils';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { renderBallotPreview } from '@votingworks/hmpb';
import { HP_4001_PRINTER_CONFIG, PrintSides } from '@votingworks/printing';
import { LogEventId } from '@votingworks/logging';
import {
  BallotType,
  type CandidateContest,
  type Contest,
  HmpbBallotPaperSize,
  LanguageCode,
  type Party,
  type PollingPlace,
  type Precinct,
  type YesNoContest,
} from '@votingworks/types';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  attachUsbDrive,
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
  mockSystemAdministratorAuth,
  saveTmpFile,
} from '../test/app.js';
import { getElectionPackageFilesPath } from './election_definition/election_package.js';

const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

vi.mock(
  import('@votingworks/election-definition-backend'),
  async (importActual) => {
    const actual = await importActual();
    return {
      ...actual,
      getStateFeaturesConfig: vi.fn(actual.getStateFeaturesConfig),
      renderElectionPackageAndBallots: vi.fn(
        actual.renderElectionPackageAndBallots
      ),
    };
  }
);

vi.mock(import('@votingworks/hmpb'), async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    renderBallotPreview: vi.fn(actual.renderBallotPreview),
  };
});

const electionDefinition = readElectionGeneralDefinition();

beforeEach(() => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_ADMIN_ELECTION_DESIGN
  );
  vi.stubEnv('VX_MACHINE_STATE', 'DEMO');
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-05T12:00:00') });
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
  vi.mocked(getStateFeaturesConfig).mockReset();
  vi.mocked(renderElectionPackageAndBallots).mockReset();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('election definition methods', () => {
  describeElectionDefinitionMethods(() => {
    const { electionDefinitionApiClient, auth } = buildTestEnvironment();
    mockSystemAdministratorAuth(auth);
    return {
      methods: electionDefinitionApiClient,
      createElection: () =>
        electionDefinitionApiClient.createInProgressElection(),
      expectedStateFeatures: {
        ...stateFeatureConfigs.DEMO,
        AUDIO_ENABLED: false,
        BALLOT_LANGUAGE_CONFIG: false,
      },
    };
  });
});

test('is disabled when the feature flag is off', async () => {
  featureFlagMock.resetFeatureFlags();
  const { apiClient, electionDefinitionApiClient, auth } =
    buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  expect(await apiClient.isElectionDefinitionEnabled()).toEqual(false);
  await expect(
    electionDefinitionApiClient.getCurrentInProgressElection()
  ).rejects.toThrow('election-definition:disabled');
});

test('requires a system administrator', async () => {
  const { electionDefinitionApiClient, auth } = buildTestEnvironment();

  await expect(
    electionDefinitionApiClient.getCurrentInProgressElection()
  ).rejects.toThrow('auth:forbidden');

  mockElectionManagerAuth(auth, electionDefinition.election);
  await expect(
    electionDefinitionApiClient.createInProgressElection()
  ).rejects.toThrow('auth:forbidden');
});

test('create, edit and discard an election definition', async () => {
  const { apiClient, electionDefinitionApiClient, auth, logger } =
    buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  expect(await apiClient.isElectionDefinitionEnabled()).toEqual(true);
  expect(
    await electionDefinitionApiClient.getCurrentInProgressElection()
  ).toEqual(null);

  const electionId =
    await electionDefinitionApiClient.createInProgressElection();
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.ElectionDefinitionCreated,
    {
      message: `Created election definition ${electionId}.`,
      disposition: 'success',
    }
  );
  expect(
    await electionDefinitionApiClient.getCurrentInProgressElection()
  ).toEqual(await electionDefinitionApiClient.getElectionInfo({ electionId }));
  expect(
    await electionDefinitionApiClient.getElectionInfo({ electionId })
  ).toEqual({
    electionId,
    type: 'general',
    date: new DateWithoutTime('2026-11-05'),
    title: '',
    state: 'DEMO',
    jurisdictionName: '',
    seal: '',
    languageCodes: [LanguageCode.ENGLISH],
  });
  expect(
    await electionDefinitionApiClient.getStateFeatures({ electionId })
  ).toEqual({
    ...stateFeatureConfigs.DEMO,
    AUDIO_ENABLED: false,
    BALLOT_LANGUAGE_CONFIG: false,
  });

  const electionInfoUpdate: ElectionInfoUpdate = {
    electionId,
    type: 'primary',
    date: new DateWithoutTime('2027-03-02'),
    title: ' Primary Election ',
    state: 'Demo State',
    jurisdictionName: 'Demo County',
    seal: '<svg>seal</svg>',
    signatureImage: '<svg>signature</svg>',
    signatureCaption: 'Clerk',
    languageCodes: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
  };
  expect(
    await electionDefinitionApiClient.updateElectionInfo(electionInfoUpdate)
  ).toEqual(ok());
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.ElectionDefinitionInfoUpdated,
    {
      message: `Updated election info for election definition ${electionId}.`,
      disposition: 'success',
    }
  );
  expect(
    await electionDefinitionApiClient.getElectionInfo({ electionId })
  ).toEqual({
    ...electionInfoUpdate,
    title: 'Primary Election',
  });
  expect(
    await electionDefinitionApiClient.getCurrentInProgressElection()
  ).toEqual({
    ...electionInfoUpdate,
    title: 'Primary Election',
  });

  const {
    signatureImage: _signatureImage,
    signatureCaption: _signatureCaption,
    ...withoutSignature
  } = electionInfoUpdate;
  expect(
    await electionDefinitionApiClient.updateElectionInfo(withoutSignature)
  ).toEqual(ok());
  expect(
    await electionDefinitionApiClient.getElectionInfo({ electionId })
  ).toEqual({
    ...withoutSignature,
    title: 'Primary Election',
  });

  await electionDefinitionApiClient.deleteElection({ electionId });
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.ElectionDefinitionDiscarded,
    {
      message: `Discarded election definition ${electionId}.`,
      disposition: 'success',
    }
  );
  expect(
    await electionDefinitionApiClient.getCurrentInProgressElection()
  ).toEqual(null);
});

test('deleting an unknown election definition fails', async () => {
  const { electionDefinitionApiClient, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  await suppressingConsoleOutput(() =>
    expect(
      electionDefinitionApiClient.deleteElection({ electionId: 'unknown' })
    ).rejects.toThrow('Election definition not found')
  );
});

test('only one election definition at a time', async () => {
  const { electionDefinitionApiClient, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  await electionDefinitionApiClient.createInProgressElection();
  await suppressingConsoleOutput(() =>
    expect(
      electionDefinitionApiClient.createInProgressElection()
    ).rejects.toThrow('An election definition already exists.')
  );
});

test('cannot create an election definition while configured', async () => {
  const { apiClient, electionDefinitionApiClient, auth } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockSystemAdministratorAuth(auth);

  await suppressingConsoleOutput(() =>
    expect(
      electionDefinitionApiClient.createInProgressElection()
    ).rejects.toThrow(
      'Cannot create an election definition while an election is configured.'
    )
  );
});

test('rejects requests for another election', async () => {
  const { electionDefinitionApiClient, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  await suppressingConsoleOutput(() =>
    expect(
      electionDefinitionApiClient.getElectionInfo({ electionId: 'missing' })
    ).rejects.toThrow('Election definition not found')
  );

  await electionDefinitionApiClient.createInProgressElection();
  await suppressingConsoleOutput(() =>
    expect(
      electionDefinitionApiClient.getStateFeatures({ electionId: 'missing' })
    ).rejects.toThrow('Election definition not found')
  );
});

test('unconfiguring removes the election definition', async () => {
  const { apiClient, electionDefinitionApiClient, auth } =
    buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  await electionDefinitionApiClient.createInProgressElection();

  await apiClient.unconfigure();
  expect(
    await electionDefinitionApiClient.getCurrentInProgressElection()
  ).toEqual(null);
});

test('unsupported machine state', async () => {
  vi.stubEnv('VX_MACHINE_STATE', 'MI');
  const { apiClient, electionDefinitionApiClient, auth } =
    buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  expect(await apiClient.isElectionDefinitionEnabled()).toEqual(false);
  await expect(
    electionDefinitionApiClient.createInProgressElection()
  ).rejects.toThrow('election-definition:disabled');
});

test('rejects combined ballot primaries', async () => {
  const { electionDefinitionApiClient, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId =
    await electionDefinitionApiClient.createInProgressElection();
  const electionInfo = await electionDefinitionApiClient.getElectionInfo({
    electionId,
  });

  await suppressingConsoleOutput(() =>
    expect(
      electionDefinitionApiClient.updateElectionInfo({
        ...electionInfo,
        title: 'Primary Election',
        jurisdictionName: 'Demo County',
        type: 'primary',
        isMiCombinedBallotPrimary: true,
      })
    ).rejects.toThrow('Combined ballot primaries are not supported.')
  );
});

test('edit districts', async () => {
  const { electionDefinitionApiClient, auth, logger } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId =
    await electionDefinitionApiClient.createInProgressElection();
  expect(
    await electionDefinitionApiClient.listDistricts({ electionId })
  ).toEqual([]);

  expect(
    await electionDefinitionApiClient.updateDistricts({
      electionId,
      newDistricts: [
        { id: 'district-1', name: 'District 1' },
        { id: 'district-2', name: 'District 2' },
      ],
    })
  ).toEqual(ok());
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionDistrictsUpdated,
    {
      message: `Updated districts for election definition ${electionId}.`,
      disposition: 'success',
    }
  );

  expect(
    await electionDefinitionApiClient.updateDistricts({
      electionId,
      deletedDistrictIds: ['district-1'],
      updatedDistricts: [{ id: 'district-2', name: 'District 1' }],
    })
  ).toEqual(ok());
  expect(
    await electionDefinitionApiClient.listDistricts({ electionId })
  ).toEqual([{ id: 'district-2', name: 'District 1' }]);
});

test('rejects duplicate district names', async () => {
  const { electionDefinitionApiClient, auth, logger } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId =
    await electionDefinitionApiClient.createInProgressElection();
  (
    await electionDefinitionApiClient.updateDistricts({
      electionId,
      newDistricts: [{ id: 'district-1', name: 'District 1' }],
    })
  ).unsafeUnwrap();

  expect(
    await electionDefinitionApiClient.updateDistricts({
      electionId,
      newDistricts: [{ id: 'district-2', name: 'District 1' }],
    })
  ).toEqual(err({ code: 'duplicate-name', districtId: 'district-2' }));
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionDistrictsUpdated,
    {
      message: `Error updating districts for election definition ${electionId}: district district-2 has a duplicate name.`,
      disposition: 'failure',
    }
  );
  expect(
    await electionDefinitionApiClient.listDistricts({ electionId })
  ).toEqual([{ id: 'district-1', name: 'District 1' }]);
});

test('rejects invalid districts', async () => {
  const { electionDefinitionApiClient, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId =
    await electionDefinitionApiClient.createInProgressElection();

  await suppressingConsoleOutput(() =>
    expect(
      electionDefinitionApiClient.updateDistricts({
        electionId,
        newDistricts: [{ id: 'district-1', name: '' }],
      })
    ).rejects.toThrow()
  );

  await suppressingConsoleOutput(() =>
    expect(
      electionDefinitionApiClient.updateDistricts({
        electionId: 'missing',
        newDistricts: [{ id: 'district-1', name: 'District 1' }],
      })
    ).rejects.toThrow('Election definition not found')
  );
  await suppressingConsoleOutput(() =>
    expect(
      electionDefinitionApiClient.listDistricts({ electionId: 'missing' })
    ).rejects.toThrow('Election definition not found')
  );
  expect(
    await electionDefinitionApiClient.listDistricts({ electionId })
  ).toEqual([]);
});

const democrats: Party = {
  id: 'party-1',
  name: 'Democrat',
  fullName: 'Democratic Party',
  abbrev: 'D',
};

test('edit parties', async () => {
  const {
    electionDefinitionApiClient: api,
    auth,
    logger,
  } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await api.createInProgressElection();
  expect(await api.listParties({ electionId })).toEqual([]);

  const republicans: Party = {
    id: 'party-2',
    name: 'Republican',
    fullName: 'Republican Party',
    abbrev: 'R',
  };
  expect(
    await api.updateParties({
      electionId,
      newParties: [republicans, democrats],
    })
  ).toEqual(ok());
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionPartiesUpdated,
    {
      message: `Updated parties for election definition ${electionId}.`,
      disposition: 'success',
    }
  );
  expect(await api.listParties({ electionId })).toEqual([
    democrats,
    republicans,
  ]);

  const renamedRepublicans: Party = { ...republicans, name: 'Democrat' };
  expect(
    await api.updateParties({
      electionId,
      deletedPartyIds: [democrats.id],
      updatedParties: [renamedRepublicans],
    })
  ).toEqual(ok());
  expect(await api.listParties({ electionId })).toEqual([renamedRepublicans]);
});

test.each([
  {
    conflict: { name: 'Democrat', fullName: 'Democratic Party', abbrev: 'D' },
    code: 'duplicate-name',
    description: 'short name',
  },
  {
    conflict: { name: 'Other', fullName: 'Democratic Party', abbrev: 'D' },
    code: 'duplicate-full-name',
    description: 'full name',
  },
  {
    conflict: { name: 'Other', fullName: 'Other Party', abbrev: 'D' },
    code: 'duplicate-abbrev',
    description: 'abbreviation',
  },
] as const)(
  'rejects a party with a duplicate $description',
  async ({ conflict, code, description }) => {
    const {
      electionDefinitionApiClient: api,
      auth,
      logger,
    } = buildTestEnvironment();
    mockSystemAdministratorAuth(auth);
    const electionId = await api.createInProgressElection();
    (
      await api.updateParties({ electionId, newParties: [democrats] })
    ).unsafeUnwrap();

    expect(
      await api.updateParties({
        electionId,
        newParties: [{ id: 'party-2', ...conflict }],
      })
    ).toEqual(err({ code, partyId: 'party-2' }));
    expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
      LogEventId.ElectionDefinitionPartiesUpdated,
      {
        message: `Error updating parties for election definition ${electionId}: party party-2 has a duplicate ${description}.`,
        disposition: 'failure',
      }
    );
    expect(await api.listParties({ electionId })).toEqual([democrats]);
  }
);

test('rejects deleting a party that would make two contests the same', async () => {
  const {
    electionDefinitionApiClient: api,
    auth,
    logger,
  } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await api.createInProgressElection();
  (
    await api.updateDistricts({
      electionId,
      newDistricts: [{ id: 'district-1', name: 'District 1' }],
    })
  ).unsafeUnwrap();
  (
    await api.updateParties({ electionId, newParties: [democrats] })
  ).unsafeUnwrap();
  const contest: CandidateContest = {
    id: 'mayor',
    type: 'candidate',
    title: 'Mayor',
    districtId: 'district-1',
    seats: 1,
    allowWriteIns: true,
    candidates: [],
  };
  for (const newContest of [
    { ...contest, partyId: democrats.id },
    { ...contest, id: 'nonpartisan-mayor' },
  ]) {
    (await api.createContest({ electionId, newContest })).unsafeUnwrap();
  }

  expect(
    await api.updateParties({ electionId, deletedPartyIds: [democrats.id] })
  ).toEqual(err({ code: 'duplicate-contest', partyId: democrats.id }));
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionPartiesUpdated,
    {
      message: `Error updating parties for election definition ${electionId}: deleting party ${democrats.id} would make two contests the same.`,
      disposition: 'failure',
    }
  );
  expect(await api.listParties({ electionId })).toEqual([democrats]);
});

test('rejects invalid parties and unknown elections', async () => {
  const { electionDefinitionApiClient: api, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await api.createInProgressElection();

  await suppressingConsoleOutput(async () => {
    await expect(
      api.updateParties({
        electionId,
        newParties: [{ ...democrats, abbrev: '' }],
      })
    ).rejects.toThrow();
    await expect(
      api.updateParties({ electionId, updatedParties: [democrats] })
    ).rejects.toThrow('Party not found');

    await expect(api.listParties({ electionId: 'missing' })).rejects.toThrow(
      'Election definition not found'
    );
    await expect(
      api.updateParties({ electionId: 'missing', newParties: [democrats] })
    ).rejects.toThrow('Election definition not found');
  });
  expect(await api.listParties({ electionId })).toEqual([]);
});

const mayor: CandidateContest = {
  id: 'mayor',
  type: 'candidate',
  title: 'Mayor',
  districtId: 'district-1',
  seats: 1,
  allowWriteIns: true,
  candidates: [
    {
      id: 'candidate-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      name: 'Ada Lovelace',
    },
  ],
};

const measure: YesNoContest = {
  id: 'measure',
  type: 'yesno',
  title: 'Measure 1',
  districtId: 'district-1',
  description: '<p>Should we?</p>',
  options: [
    { id: 'measure-yes', label: 'Yes' },
    { id: 'measure-no', label: 'No' },
  ],
};

async function createElectionWithDistrict(
  api: ReturnType<typeof buildTestEnvironment>['electionDefinitionApiClient']
): Promise<string> {
  const electionId = await api.createInProgressElection();
  (
    await api.updateDistricts({
      electionId,
      newDistricts: [{ id: 'district-1', name: 'District 1' }],
    })
  ).unsafeUnwrap();
  return electionId;
}

async function createElectionWithBallotStyle(
  api: ReturnType<typeof buildTestEnvironment>['electionDefinitionApiClient'],
  {
    precinctName = 'Precinct 1',
    contests,
  }: { precinctName?: string; contests: Contest[] }
) {
  const electionId = await createElectionWithDistrict(api);
  (
    await api.createPrecinct({
      electionId,
      newPrecinct: {
        id: 'precinct-1',
        name: precinctName,
        districtIds: ['district-1'],
      },
    })
  ).unsafeUnwrap();
  for (const newContest of contests) {
    (await api.createContest({ electionId, newContest })).unsafeUnwrap();
  }
  return {
    electionId,
    precinctId: 'precinct-1',
    ballotStyleId: '1_en',
    ballotType: BallotType.Precinct,
    ballotMode: 'official',
  } as const;
}

test('edit contests', async () => {
  const {
    electionDefinitionApiClient: api,
    auth,
    logger,
  } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await createElectionWithDistrict(api);
  expect(await api.listContests({ electionId })).toEqual([]);

  expect(await api.createContest({ electionId, newContest: measure })).toEqual(
    ok()
  );
  expect(await api.createContest({ electionId, newContest: mayor })).toEqual(
    ok()
  );
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionContestCreated,
    {
      message: `Created contest mayor in election definition ${electionId}.`,
      disposition: 'success',
    }
  );
  expect(await api.listContests({ electionId })).toEqual([mayor, measure]);

  const editedMayor: CandidateContest = { ...mayor, title: 'Mayor of Town' };
  expect(
    await api.updateContest({ electionId, updatedContest: editedMayor })
  ).toEqual(ok());
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionContestUpdated,
    {
      message: `Updated contest mayor in election definition ${electionId}.`,
      disposition: 'success',
    }
  );

  await api.reorderContests({
    electionId,
    contestIds: [measure.id, mayor.id],
  });
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionContestsReordered,
    {
      message: `Reordered contests in election definition ${electionId}.`,
      disposition: 'success',
    }
  );
  expect(await api.listContests({ electionId })).toEqual([
    measure,
    editedMayor,
  ]);

  await api.deleteContest({ electionId, contestId: measure.id });
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionContestDeleted,
    {
      message: `Deleted contest measure from election definition ${electionId}.`,
      disposition: 'success',
    }
  );
  expect(await api.listContests({ electionId })).toEqual([editedMayor]);
});

test.each([
  {
    conflict: { ...mayor, candidates: [] },
    error: 'duplicate-contest',
    description:
      'another contest has the same district, title, seats, term and party',
  },
  {
    conflict: { ...measure, description: '<p>Something else?</p>' },
    error: 'duplicate-contest',
    description: 'another contest has the same district and title',
  },
  {
    conflict: {
      ...mayor,
      title: 'Other',
      candidates: [
        { ...mayor.candidates[0]!, id: 'candidate-2' },
        { ...mayor.candidates[0]!, id: 'candidate-3' },
      ],
    },
    error: 'duplicate-candidate',
    description: 'two of its candidates have the same name',
  },
  {
    conflict: {
      ...measure,
      options: [
        { id: 'measure-yes', label: 'Yes' },
        { id: 'measure-no', label: 'Yes' },
      ],
    },
    error: 'duplicate-option',
    description: 'two of its options have the same label',
  },
] as const)('rejects a contest when $description', async (spec) => {
  const {
    electionDefinitionApiClient: api,
    auth,
    logger,
  } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await createElectionWithDistrict(api);
  const otherMeasure: YesNoContest = {
    ...measure,
    id: 'other-measure',
    title: 'Other Measure',
  };
  for (const contest of [mayor, measure, otherMeasure]) {
    (
      await api.createContest({ electionId, newContest: contest })
    ).unsafeUnwrap();
  }

  const newContest: Contest = { ...spec.conflict, id: 'new-contest' };
  expect(await api.createContest({ electionId, newContest })).toEqual(
    err(spec.error)
  );
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionContestCreated,
    {
      message: `Error creating contest new-contest in election definition ${electionId}: ${spec.description}.`,
      disposition: 'failure',
    }
  );

  const updatedContest: Contest = { ...spec.conflict, id: otherMeasure.id };
  expect(await api.updateContest({ electionId, updatedContest })).toEqual(
    err(spec.error)
  );
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionContestUpdated,
    {
      message: `Error updating contest ${otherMeasure.id} in election definition ${electionId}: ${spec.description}.`,
      disposition: 'failure',
    }
  );
  expect(await api.listContests({ electionId })).toEqual([
    mayor,
    measure,
    otherMeasure,
  ]);
});

test('rejects invalid contests and unknown elections', async () => {
  const { electionDefinitionApiClient: api, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await createElectionWithDistrict(api);

  await suppressingConsoleOutput(async () => {
    await expect(
      api.createContest({ electionId, newContest: { ...mayor, title: '' } })
    ).rejects.toThrow();
    await expect(
      api.updateContest({ electionId, updatedContest: mayor })
    ).rejects.toThrow('Contest not found');
    await expect(
      api.reorderContests({ electionId, contestIds: [mayor.id] })
    ).rejects.toThrow('Contest list is out of date');
    await expect(
      api.deleteContest({ electionId, contestId: mayor.id })
    ).rejects.toThrow('Contest not found');

    const missing = { electionId: 'missing' } as const;
    await expect(api.listContests(missing)).rejects.toThrow(
      'Election definition not found'
    );
    await expect(
      api.createContest({ ...missing, newContest: mayor })
    ).rejects.toThrow('Election definition not found');
    await expect(
      api.updateContest({ ...missing, updatedContest: mayor })
    ).rejects.toThrow('Election definition not found');
    await expect(
      api.reorderContests({ ...missing, contestIds: [] })
    ).rejects.toThrow('Election definition not found');
    await expect(
      api.deleteContest({ ...missing, contestId: mayor.id })
    ).rejects.toThrow('Election definition not found');
  });
  expect(await api.listContests({ electionId })).toEqual([]);
});

test('ballot layout settings and ballot styles', async () => {
  const {
    electionDefinitionApiClient: api,
    auth,
    logger,
  } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await createElectionWithDistrict(api);
  expect(await api.getBallotLayoutSettings({ electionId })).toEqual({
    paperSize: HmpbBallotPaperSize.Letter,
    compact: false,
  });

  await api.updateBallotLayoutSettings({
    electionId,
    paperSize: HmpbBallotPaperSize.Legal,
    compact: true,
  });
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionBallotLayoutSettingsUpdated,
    {
      message: `Updated ballot layout settings in election definition ${electionId}: paper size legal, compact density.`,
      disposition: 'success',
    }
  );
  expect(await api.getBallotLayoutSettings({ electionId })).toEqual({
    paperSize: HmpbBallotPaperSize.Legal,
    compact: true,
  });

  await api.updateBallotLayoutSettings({
    electionId,
    paperSize: HmpbBallotPaperSize.Letter,
    compact: false,
  });
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionBallotLayoutSettingsUpdated,
    {
      message: `Updated ballot layout settings in election definition ${electionId}: paper size letter, default density.`,
      disposition: 'success',
    }
  );

  expect(await api.listBallotStyles({ electionId })).toEqual([]);
  (
    await api.createPrecinct({
      electionId,
      newPrecinct: {
        id: 'precinct-1',
        name: 'Precinct 1',
        districtIds: ['district-1'],
      },
    })
  ).unsafeUnwrap();
  (await api.createContest({ electionId, newContest: measure })).unsafeUnwrap();
  expect(await api.listBallotStyles({ electionId })).toEqual([
    {
      id: '1_en',
      groupId: '1',
      precincts: ['precinct-1'],
      districts: ['district-1'],
      languages: [LanguageCode.ENGLISH],
    },
  ]);
});

test('rejects invalid ballot layout settings and unknown elections', async () => {
  const {
    electionDefinitionApiClient: api,
    auth,
    logger,
  } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await createElectionWithDistrict(api);

  await suppressingConsoleOutput(async () => {
    await expect(
      api.updateBallotLayoutSettings({
        electionId,
        paperSize: 'tabloid' as HmpbBallotPaperSize,
        compact: false,
      })
    ).rejects.toThrow();
    await expect(
      api.updateBallotLayoutSettings({
        electionId,
        paperSize: HmpbBallotPaperSize.Legal,
        compact: 'false' as unknown as boolean,
      })
    ).rejects.toThrow();

    const missing = { electionId: 'missing' } as const;
    await expect(api.listBallotStyles(missing)).rejects.toThrow(
      'Election definition not found'
    );
    await expect(api.getBallotLayoutSettings(missing)).rejects.toThrow(
      'Election definition not found'
    );
    await expect(
      api.updateBallotLayoutSettings({
        ...missing,
        paperSize: HmpbBallotPaperSize.Legal,
        compact: true,
      })
    ).rejects.toThrow('Election definition not found');
  });
  expect(logger.logAsCurrentRole).not.toHaveBeenCalledWith(
    LogEventId.ElectionDefinitionBallotLayoutSettingsUpdated,
    expect.anything()
  );
  expect(await api.getBallotLayoutSettings({ electionId })).toEqual({
    paperSize: HmpbBallotPaperSize.Letter,
    compact: false,
  });
});

test('getBallotPreviewPdf renders a ballot proof and logs it', async () => {
  const {
    electionDefinitionApiClient: api,
    auth,
    logger,
  } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const spec = await createElectionWithBallotStyle(api, {
    contests: [mayor, measure],
  });
  const { electionId } = spec;

  const { pdfData, fileName } = (
    await api.getBallotPreviewPdf(spec)
  ).unsafeUnwrap();
  expect(fileName).toEqual(
    'PROOF-official-precinct-ballot-Precinct_1-1_en.pdf'
  );
  expect(new TextDecoder().decode(pdfData.slice(0, 5))).toEqual('%PDF-');
  expect(vi.mocked(renderBallotPreview)).toHaveBeenLastCalledWith(
    expect.objectContaining({
      ballotTemplateId: 'VxDefaultBallot',
      compact: false,
      ballotLanguageConfigs: [{ languages: [LanguageCode.ENGLISH] }],
    })
  );
  const { getCandidateOrderings } =
    vi.mocked(renderBallotPreview).mock.lastCall![0];
  expect(
    getCandidateOrderings({
      id: '1_en',
      groupId: '1',
      precincts: ['precinct-1'],
      districts: ['district-1'],
      languages: [LanguageCode.ENGLISH],
    })
  ).toEqual({ mayor: [{ id: 'candidate-1' }] });
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionBallotProofViewed,
    {
      message: `Viewed official precinct ballot proof for ballot style 1_en and precinct precinct-1 in election definition ${electionId}.`,
      disposition: 'success',
    }
  );

  vi.mocked(renderBallotPreview).mockResolvedValueOnce(
    err({ error: 'contestTooLong', contest: measure })
  );
  expect(
    await api.getBallotPreviewPdf({ ...spec, ballotMode: 'test' })
  ).toEqual(err({ error: 'contestTooLong', contest: measure }));
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionBallotProofViewed,
    {
      message: `Error rendering test precinct ballot proof for ballot style 1_en and precinct precinct-1 in election definition ${electionId}: contestTooLong`,
      disposition: 'failure',
    }
  );

  await suppressingConsoleOutput(async () => {
    await expect(
      api.getBallotPreviewPdf({ ...spec, electionId: 'missing' })
    ).rejects.toThrow('Election definition not found');
  });

  const electionInfo = await api.getElectionInfo({ electionId });
  (
    await api.updateElectionInfo({
      ...electionInfo,
      title: 'General Election',
      jurisdictionName: 'Demo County',
      languageCodes: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
    })
  ).unsafeUnwrap();
  await suppressingConsoleOutput(async () => {
    await expect(
      api.getBallotPreviewPdf({ ...spec, ballotStyleId: '1_es-US' })
    ).rejects.toThrow(
      'Ballot proofs can only be rendered for English-only elections, not es-US'
    );
  });
}, 60_000);

test('printBallotPreviewPdf and saveBallotPreviewPdf print and save a ballot proof', async () => {
  const {
    apiClient,
    electionDefinitionApiClient: api,
    auth,
    logger,
    mockPrinterHandler,
    usbPlatform,
  } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const spec = await createElectionWithBallotStyle(api, {
    contests: [measure],
  });
  const { electionId } = spec;
  await api.updateBallotLayoutSettings({
    electionId,
    paperSize: HmpbBallotPaperSize.Legal,
    compact: false,
  });
  const description = `official precinct ballot proof for ballot style 1_en and precinct precinct-1 in election definition ${electionId}`;

  await api.printBallotPreviewPdf(spec);
  expect(mockPrinterHandler.getPrintJobHistory()).toEqual([]);
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionBallotProofPrinted,
    {
      message: `Error printing ${description}: cannot print without printer connected`,
      disposition: 'failure',
    }
  );

  mockPrinterHandler.connectPrinter(HP_4001_PRINTER_CONFIG);
  await api.printBallotPreviewPdf(spec);
  const [printJob] = mockPrinterHandler.getPrintJobHistory();
  expect(printJob!.options).toEqual({
    size: HmpbBallotPaperSize.Legal,
    sides: PrintSides.TwoSidedLongEdge,
  });
  expect(readFileSync(printJob!.filename).subarray(0, 5).toString()).toEqual(
    '%PDF-'
  );
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionBallotProofPrinted,
    { message: `Printed ${description}.`, disposition: 'success' }
  );

  vi.mocked(renderBallotPreview).mockResolvedValueOnce(
    err({ error: 'contestTooLong', contest: measure })
  );
  await api.printBallotPreviewPdf(spec);
  expect(mockPrinterHandler.getPrintJobHistory()).toHaveLength(1);
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionBallotProofPrinted,
    {
      message: `Error printing ${description}: Ballot proof could not be rendered`,
      disposition: 'failure',
    }
  );

  const filename = 'PROOF-official-precinct-ballot-Precinct_1-1_en.pdf';
  expect(await api.saveBallotPreviewPdf({ ...spec, filename })).toEqual(
    err({ type: 'missing-usb-drive', message: 'No USB drive found' })
  );
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.FileSaved,
    {
      message: `Failed to save ${description} to ${filename} on the USB drive.`,
      disposition: 'failure',
      path: filename,
    }
  );

  await attachUsbDrive(apiClient, usbPlatform);
  const [savedPath] = (
    await api.saveBallotPreviewPdf({ ...spec, filename })
  ).unsafeUnwrap();
  expect(savedPath).toMatch(new RegExp(`/${filename}$`));
  expect(readFileSync(savedPath!).subarray(0, 5).toString()).toEqual('%PDF-');
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.FileSaved,
    {
      message: `Saved ${description} to ${filename} on the USB drive.`,
      disposition: 'success',
      path: filename,
    }
  );
}, 60_000);

test('ballot proof file names are safe to save to a USB drive', async () => {
  const {
    apiClient,
    electionDefinitionApiClient: api,
    auth,
    logger,
    usbPlatform,
  } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const spec = await createElectionWithBallotStyle(api, {
    contests: [measure],
    precinctName: 'North/South: Ward 1?',
  });
  const sanitizedFilename =
    'PROOF-official-precinct-ballot-North_South__Ward_1_-1_en.pdf';

  const { fileName } = (await api.getBallotPreviewPdf(spec)).unsafeUnwrap();
  expect(fileName).toEqual(sanitizedFilename);

  await attachUsbDrive(apiClient, usbPlatform);
  const [savedPath] = (
    await api.saveBallotPreviewPdf({
      ...spec,
      filename: 'PROOF-official-precinct-ballot-North/South:_Ward_1?-1_en.pdf',
    })
  ).unsafeUnwrap();
  expect(savedPath).toMatch(new RegExp(`/${sanitizedFilename}$`));
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.FileSaved,
    expect.objectContaining({ path: sanitizedFilename })
  );
}, 60_000);

test('edit precincts', async () => {
  const {
    electionDefinitionApiClient: api,
    auth,
    logger,
  } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await api.createInProgressElection();
  (
    await api.updateDistricts({
      electionId,
      newDistricts: [{ id: 'district-1', name: 'District 1' }],
    })
  ).unsafeUnwrap();
  expect(await api.listPrecincts({ electionId })).toEqual([]);
  expect(await api.getRegisteredVoterCounts({ electionId })).toEqual({});

  const precinct: Precinct = {
    id: 'precinct-1',
    name: 'Precinct 1',
    districtIds: ['district-1'],
  };
  expect(
    await api.createPrecinct({
      electionId,
      newPrecinct: precinct,
      registeredVoterCounts: { total: 100 },
    })
  ).toEqual(ok());
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionPrecinctCreated,
    {
      message: `Created precinct precinct-1 in election definition ${electionId}.`,
      disposition: 'success',
    }
  );
  expect(await api.listPrecincts({ electionId })).toEqual([precinct]);
  expect(await api.getRegisteredVoterCounts({ electionId })).toEqual({
    'precinct-1': { total: 100 },
  });

  const updatedPrecinct: Precinct = {
    id: 'precinct-1',
    name: 'Precinct 1',
    splits: [
      { id: 'split-1', name: 'Split 1', districtIds: ['district-1'] },
      { id: 'split-2', name: 'Split 2', districtIds: [] },
    ],
  };
  expect(
    await api.updatePrecinct({
      electionId,
      updatedPrecinct,
      registeredVoterCounts: { splits: { 'split-1': { total: 60 } } },
    })
  ).toEqual(ok());
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionPrecinctUpdated,
    {
      message: `Updated precinct precinct-1 in election definition ${electionId}.`,
      disposition: 'success',
    }
  );
  expect(await api.listPrecincts({ electionId })).toEqual([updatedPrecinct]);
  expect(await api.getRegisteredVoterCounts({ electionId })).toEqual({
    'precinct-1': { splits: { 'split-1': { total: 60 } } },
  });

  await api.deletePrecinct({ electionId, precinctId: 'precinct-1' });
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionPrecinctDeleted,
    {
      message: `Deleted precinct precinct-1 from election definition ${electionId}.`,
      disposition: 'success',
    }
  );
  expect(await api.listPrecincts({ electionId })).toEqual([]);
  expect(await api.getRegisteredVoterCounts({ electionId })).toEqual({});
});

test('rejects duplicate precinct names and split districts', async () => {
  const {
    electionDefinitionApiClient: api,
    auth,
    logger,
  } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await api.createInProgressElection();
  (
    await api.updateDistricts({
      electionId,
      newDistricts: [{ id: 'district-1', name: 'District 1' }],
    })
  ).unsafeUnwrap();
  const precinct: Precinct = {
    id: 'precinct-1',
    name: 'Precinct 1',
    districtIds: [],
  };
  (
    await api.createPrecinct({ electionId, newPrecinct: precinct })
  ).unsafeUnwrap();

  expect(
    await api.createPrecinct({
      electionId,
      newPrecinct: { id: 'precinct-2', name: 'Precinct 1', districtIds: [] },
    })
  ).toEqual(err('duplicate-precinct-name'));
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionPrecinctCreated,
    {
      message: `Error creating precinct precinct-2 in election definition ${electionId}: another precinct has the same name.`,
      disposition: 'failure',
    }
  );

  expect(
    await api.updatePrecinct({
      electionId,
      updatedPrecinct: {
        id: 'precinct-1',
        name: 'Precinct 1',
        splits: [
          { id: 'split-1', name: 'Split', districtIds: [] },
          { id: 'split-2', name: 'Split', districtIds: ['district-1'] },
        ],
      },
    })
  ).toEqual(err('duplicate-split-name'));
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionPrecinctUpdated,
    {
      message: `Error updating precinct precinct-1 in election definition ${electionId}: two of its splits have the same name.`,
      disposition: 'failure',
    }
  );

  expect(
    await api.updatePrecinct({
      electionId,
      updatedPrecinct: {
        id: 'precinct-1',
        name: 'Precinct 1',
        splits: [
          { id: 'split-1', name: 'Split 1', districtIds: [] },
          { id: 'split-2', name: 'Split 2', districtIds: [] },
        ],
      },
    })
  ).toEqual(err('duplicate-split-districts'));
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionPrecinctUpdated,
    {
      message: `Error updating precinct precinct-1 in election definition ${electionId}: two of its splits have the same districts.`,
      disposition: 'failure',
    }
  );
  expect(await api.listPrecincts({ electionId })).toEqual([precinct]);
});

test('rejects invalid precincts and unknown elections', async () => {
  const { electionDefinitionApiClient: api, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await api.createInProgressElection();
  const precinct: Precinct = {
    id: 'precinct-1',
    name: 'Precinct 1',
    districtIds: [],
  };

  await suppressingConsoleOutput(async () => {
    await expect(
      api.createPrecinct({
        electionId,
        newPrecinct: { ...precinct, name: '' },
      })
    ).rejects.toThrow();
    await expect(
      api.updatePrecinct({ electionId, updatedPrecinct: precinct })
    ).rejects.toThrow('Precinct not found');
    await expect(
      api.deletePrecinct({ electionId, precinctId: 'precinct-1' })
    ).rejects.toThrow('Precinct not found');

    await expect(api.listPrecincts({ electionId: 'missing' })).rejects.toThrow(
      'Election definition not found'
    );
    await expect(
      api.createPrecinct({ electionId: 'missing', newPrecinct: precinct })
    ).rejects.toThrow('Election definition not found');
    await expect(
      api.updatePrecinct({ electionId: 'missing', updatedPrecinct: precinct })
    ).rejects.toThrow('Election definition not found');
    await expect(
      api.deletePrecinct({ electionId: 'missing', precinctId: 'precinct-1' })
    ).rejects.toThrow('Election definition not found');
    await expect(
      api.getRegisteredVoterCounts({ electionId: 'missing' })
    ).rejects.toThrow('Election definition not found');
  });
  expect(await api.listPrecincts({ electionId })).toEqual([]);
});

test('edit polling places', async () => {
  const {
    electionDefinitionApiClient: api,
    auth,
    logger,
  } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await api.createInProgressElection();
  (
    await api.createPrecinct({
      electionId,
      newPrecinct: { id: 'precinct-1', name: 'Precinct 1', districtIds: [] },
    })
  ).unsafeUnwrap();
  const generatedPlaces = await api.listPollingPlaces({ electionId });

  const place: PollingPlace = {
    id: 'place-1',
    name: 'Town Hall',
    precincts: { 'precinct-1': { type: 'whole' } },
    type: 'early_voting',
  };
  expect(await api.setPollingPlace({ electionId, place })).toEqual(ok());
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionPollingPlaceSaved,
    {
      message: `Saved polling place place-1 in election definition ${electionId}.`,
      disposition: 'success',
    }
  );
  expect(await api.listPollingPlaces({ electionId })).toEqual([
    place,
    ...generatedPlaces,
  ]);

  const updatedPlace: PollingPlace = {
    ...place,
    name: 'Library',
    precincts: {},
    type: 'absentee',
  };
  expect(
    await api.setPollingPlace({ electionId, place: updatedPlace })
  ).toEqual(ok());
  expect(await api.listPollingPlaces({ electionId })).toEqual([
    updatedPlace,
    ...generatedPlaces,
  ]);

  await api.deletePollingPlace({ electionId, id: 'place-1' });
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionPollingPlaceDeleted,
    {
      message: `Deleted polling place place-1 from election definition ${electionId}.`,
      disposition: 'success',
    }
  );
  expect(await api.listPollingPlaces({ electionId })).toEqual(generatedPlaces);
});

test('rejects duplicate polling place names and unknown precincts', async () => {
  const {
    electionDefinitionApiClient: api,
    auth,
    logger,
  } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await api.createInProgressElection();
  const place: PollingPlace = {
    id: 'place-1',
    name: 'Town Hall',
    precincts: {},
    type: 'election_day',
  };
  (await api.setPollingPlace({ electionId, place })).unsafeUnwrap();

  expect(
    await api.setPollingPlace({
      electionId,
      place: { ...place, id: 'place-2' },
    })
  ).toEqual(err('duplicate-name'));
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionPollingPlaceSaved,
    {
      message: `Error saving polling place place-2 in election definition ${electionId}: another polling place of the same type has the same name.`,
      disposition: 'failure',
    }
  );

  expect(
    await api.setPollingPlace({
      electionId,
      place: { ...place, precincts: { missing: { type: 'whole' } } },
    })
  ).toEqual(err('invalid-precinct'));
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionPollingPlaceSaved,
    {
      message: `Error saving polling place place-1 in election definition ${electionId}: one of its precincts is not in the election.`,
      disposition: 'failure',
    }
  );
  expect(await api.listPollingPlaces({ electionId })).toEqual([place]);
});

test('rejects invalid polling places and unknown elections', async () => {
  const { electionDefinitionApiClient: api, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await api.createInProgressElection();
  const place: PollingPlace = {
    id: 'place-1',
    name: 'Town Hall',
    precincts: {},
    type: 'election_day',
  };

  await suppressingConsoleOutput(async () => {
    await expect(
      api.setPollingPlace({
        electionId,
        place: { ...place, type: 'mail' as PollingPlace['type'] },
      })
    ).rejects.toThrow();
    await expect(
      api.deletePollingPlace({ electionId, id: 'place-1' })
    ).rejects.toThrow('Polling place not found');

    await expect(
      api.listPollingPlaces({ electionId: 'missing' })
    ).rejects.toThrow('Election definition not found');
    await expect(
      api.setPollingPlace({ electionId: 'missing', place })
    ).rejects.toThrow('Election definition not found');
    await expect(
      api.deletePollingPlace({ electionId: 'missing', id: 'place-1' })
    ).rejects.toThrow('Election definition not found');
  });
  expect(await api.listPollingPlaces({ electionId })).toEqual([]);
});

test('creating a precinct creates an election day polling place for it', async () => {
  const { electionDefinitionApiClient: api, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await api.createInProgressElection();
  (
    await api.createPrecinct({
      electionId,
      newPrecinct: { id: 'precinct-1', name: 'Precinct 1', districtIds: [] },
    })
  ).unsafeUnwrap();
  (
    await api.updatePrecinct({
      electionId,
      updatedPrecinct: {
        id: 'precinct-1',
        name: 'Precinct A',
        districtIds: [],
      },
    })
  ).unsafeUnwrap();

  expect(await api.listPollingPlaces({ electionId })).toEqual([
    {
      id: expect.any(String),
      name: 'Precinct 1',
      precincts: { 'precinct-1': { type: 'whole' } },
      type: 'election_day',
    },
  ]);
});

test('creating a precinct creates no polling place without EDIT_POLLING_PLACES', async () => {
  vi.mocked(getStateFeaturesConfig).mockReturnValue({
    ...stateFeatureConfigs.DEMO,
    EDIT_POLLING_PLACES: false,
  });
  const { electionDefinitionApiClient: api, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await api.createInProgressElection();
  (
    await api.createPrecinct({
      electionId,
      newPrecinct: { id: 'precinct-1', name: 'Precinct 1', districtIds: [] },
    })
  ).unsafeUnwrap();

  expect(await api.listPollingPlaces({ electionId })).toEqual([]);
});

test('createInProgressElection seeds system settings from the state profile', async () => {
  const {
    electionDefinitionApiClient: api,
    auth,
    workspace,
  } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await api.createInProgressElection();
  expect(
    workspace.store.electionDefinition.getSystemSettings(electionId)
  ).toEqual(stateDefaultSystemSettings('DEMO'));
});

async function createFinalizableElection(
  api: ReturnType<typeof buildTestEnvironment>['electionDefinitionApiClient'],
  { withAbsenteePollingPlace = true } = {}
) {
  const spec = await createElectionWithBallotStyle(api, {
    contests: [mayor, measure],
  });
  (
    await api.updateElectionInfo({
      ...(await api.getElectionInfo({ electionId: spec.electionId })),
      title: 'General Election',
      jurisdictionName: 'Demo County',
    })
  ).unsafeUnwrap();
  if (!withAbsenteePollingPlace) {
    return spec.electionId;
  }
  (
    await api.setPollingPlace({
      electionId: spec.electionId,
      place: {
        id: 'absentee-place',
        name: 'Town Hall',
        type: 'absentee',
        precincts: { 'precinct-1': { type: 'whole' } },
      },
    })
  ).unsafeUnwrap();
  return spec.electionId;
}

async function waitForElectionPackage(
  api: ReturnType<typeof buildTestEnvironment>['electionDefinitionApiClient'],
  electionId: string
) {
  return await vi.waitFor(
    async () => {
      const electionPackage = await api.getElectionPackageRenderingStatus({
        electionId,
      });
      if (electionPackage?.status === 'running') {
        throw new Error('Election package is still being built');
      }
      return electionPackage;
    },
    { timeout: 60_000, interval: 100 }
  );
}

test('finalize locks the election definition, builds its election package and configures VxAdmin with it until unconfigure', async () => {
  const {
    apiClient,
    electionDefinitionApiClient: api,
    auth,
    logger,
    workspace,
  } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await createFinalizableElection(api);
  expect(await api.getElectionPackageRenderingStatus({ electionId })).toEqual(
    null
  );

  await api.finalizeElection({ electionId });
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.ElectionDefinitionFinalized,
    {
      message: `Finalized election definition ${electionId}; rendering its ballots, building its election package and configuring VxAdmin with it.`,
      disposition: 'success',
    }
  );
  await expect(
    api.updateBallotLayoutSettings({
      electionId,
      paperSize: HmpbBallotPaperSize.Legal,
      compact: false,
    })
  ).rejects.toThrow('Election definition is finalized');
  await expect(api.finalizeElection({ electionId })).rejects.toThrow(
    'Election definition is finalized'
  );

  const electionPackage = await waitForElectionPackage(api, electionId);
  assert(electionPackage?.status === 'succeeded');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ElectionDefinitionElectionPackageBuilt,
    'system',
    {
      message: `Built the election package for election definition ${electionId}.`,
      disposition: 'success',
    }
  );
  expect(vi.mocked(renderElectionPackageAndBallots)).toHaveBeenLastCalledWith(
    expect.objectContaining({ outputDirectory: electionId }),
    expect.objectContaining({
      stateCode: 'DEMO',
      ballotTemplateId: 'VxDefaultBallot',
      ballotLanguageConfigs: [{ languages: [LanguageCode.ENGLISH] }],
      shouldExportSampleBallots: false,
      shouldExportTestBallots: true,
    })
  );
  expect(electionPackage.sampleBallotsPath).toBeUndefined();

  const filesPath = getElectionPackageFilesPath(workspace.store);
  expect(readdirSync(join(filesPath, electionId)).sort()).toEqual(
    [
      electionPackage.officialBallotsPath,
      assertDefined(electionPackage.testBallotsPath),
    ]
      .map((ballotsPath) => basename(ballotsPath))
      .sort()
  );
  const configuredPackagePath = assertDefined(
    workspace.store.getElectionPackageFilePath(
      assertDefined(workspace.store.getCurrentElectionId())
    )
  );
  const { electionPackage: parsedPackage } = (
    await readElectionPackageFromFile(configuredPackagePath)
  ).unsafeUnwrap();
  expect(parsedPackage.electionDefinition.ballotHash).toEqual(
    electionPackage.ballotHash
  );
  expect(parsedPackage.electionDefinition.election.contests).toHaveLength(2);
  expect(parsedPackage.systemSettings).toEqual(
    stateDefaultSystemSettings('DEMO')
  );
  expect(
    existsSync(join(filesPath, electionPackage.officialBallotsPath))
  ).toEqual(true);
  expect(
    existsSync(join(filesPath, assertDefined(electionPackage.testBallotsPath)))
  ).toEqual(true);

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ElectionConfigured,
    'system',
    {
      disposition: 'success',
      newBallotHash: electionPackage.ballotHash,
      message: `Configured VxAdmin with the election package built from election definition ${electionId}.`,
    },
    undefined
  );
  const electionRecord = assertDefined(
    await apiClient.getCurrentElectionMetadata()
  );
  expect(electionRecord.electionDefinition.ballotHash).toEqual(
    electionPackage.ballotHash
  );
  expect(await apiClient.getSystemSettings()).toEqual(
    stateDefaultSystemSettings('DEMO')
  );

  expect(await api.getElectionInfo({ electionId })).toMatchObject({
    title: 'General Election',
  });
  await expect(api.finalizeElection({ electionId })).rejects.toThrow(
    'Election definition is finalized'
  );
  await expect(api.deleteElection({ electionId })).rejects.toThrow(
    'Cannot discard an election definition while VxAdmin is configured'
  );

  await apiClient.unconfigure();
  expect(await apiClient.getCurrentElectionMetadata()).toEqual(null);
  expect(await api.getCurrentInProgressElection()).toEqual(null);
  expect(existsSync(filesPath)).toEqual(false);
}, 60_000);

test('finalize rejects an election definition that is not ready', async () => {
  const { electionDefinitionApiClient: api, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  const electionId = await createElectionWithDistrict(api);
  await expect(api.finalizeElection({ electionId })).rejects.toThrow(
    'Election info is incomplete'
  );
  (
    await api.updateElectionInfo({
      ...(await api.getElectionInfo({ electionId })),
      title: 'General Election',
      jurisdictionName: 'Demo County',
    })
  ).unsafeUnwrap();
  await expect(api.finalizeElection({ electionId })).rejects.toThrow(
    'Election definition has no ballot styles'
  );

  (
    await api.createPrecinct({
      electionId,
      newPrecinct: {
        id: 'precinct-1',
        name: 'Precinct 1',
        districtIds: ['district-1'],
      },
    })
  ).unsafeUnwrap();
  (await api.createContest({ electionId, newContest: measure })).unsafeUnwrap();
  await expect(api.finalizeElection({ electionId })).rejects.toThrow(
    'Absentee polling places must cover every precinct for central scanning'
  );

  (
    await api.createPrecinct({
      electionId,
      newPrecinct: {
        id: 'precinct-2',
        name: 'Precinct 2',
        districtIds: ['district-1'],
      },
      registeredVoterCounts: { total: 100 },
    })
  ).unsafeUnwrap();
  await expect(api.finalizeElection({ electionId })).rejects.toThrow(
    'Registered voter counts must be provided for all precincts and splits or none'
  );
  expect(await api.getElectionPackageRenderingStatus({ electionId })).toEqual(
    null
  );
});

test('finalize skips the absentee polling place check when polling places are generated', async () => {
  vi.mocked(getStateFeaturesConfig).mockReturnValue({
    ...stateFeatureConfigs.DEMO,
    EDIT_POLLING_PLACES: false,
  });
  const { electionDefinitionApiClient: api, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await createFinalizableElection(api, {
    withAbsenteePollingPlace: false,
  });
  vi.mocked(renderElectionPackageAndBallots).mockRejectedValueOnce(
    new Error('not rendered')
  );

  await api.finalizeElection({ electionId });
  expect(await waitForElectionPackage(api, electionId)).toEqual({
    status: 'failed',
    error: 'not rendered',
  });
});

test('a failed election package build returns the election definition to editing, and it can be finalized again', async () => {
  const {
    apiClient,
    electionDefinitionApiClient: api,
    auth,
    logger,
    workspace,
  } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await createFinalizableElection(api);
  vi.mocked(renderElectionPackageAndBallots).mockRejectedValueOnce(
    new Error('Contest is too long')
  );

  await api.finalizeElection({ electionId });
  expect(await waitForElectionPackage(api, electionId)).toEqual({
    status: 'failed',
    error: 'Contest is too long',
  });
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ElectionDefinitionElectionPackageBuilt,
    'system',
    {
      message: `Error building the election package for election definition ${electionId}: Contest is too long`,
      disposition: 'failure',
    }
  );
  await api.updateBallotLayoutSettings({
    electionId,
    paperSize: HmpbBallotPaperSize.Legal,
    compact: false,
  });

  const staleBallotsPath = join(
    getElectionPackageFilesPath(workspace.store),
    electionId,
    'official-ballots-stale.zip'
  );
  mkdirSync(dirname(staleBallotsPath), { recursive: true });
  writeFileSync(staleBallotsPath, 'stale');
  vi.mocked(renderElectionPackageAndBallots).mockResolvedValueOnce({
    electionDefinition,
    electionPackageScratchPath: saveTmpFile('not a zip', '.zip'),
    officialBallotsPath: `${electionId}/official-ballots.zip`,
  });
  await api.finalizeElection({ electionId });
  expect(await waitForElectionPackage(api, electionId)).toEqual({
    status: 'failed',
    error:
      'VxAdmin could not be configured with the election package (invalid-zip).',
  });
  expect(await apiClient.getCurrentElectionMetadata()).toEqual(null);
  expect(existsSync(staleBallotsPath)).toEqual(false);
});

test('a build that fails after configuring VxAdmin still records the election package and keeps the definition finalized', async () => {
  const {
    apiClient,
    electionDefinitionApiClient: api,
    auth,
    logger,
    workspace,
  } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await createFinalizableElection(api);
  vi.mocked(logger.log).mockImplementation((eventId) =>
    eventId === LogEventId.ElectionConfigured
      ? Promise.reject(new Error('Logging failed'))
      : Promise.resolve()
  );

  await api.finalizeElection({ electionId });
  expect(await waitForElectionPackage(api, electionId)).toEqual(
    expect.objectContaining({ status: 'succeeded' })
  );
  vi.mocked(logger.log).mockReset();
  expect(await apiClient.getCurrentElectionMetadata()).not.toEqual(null);
  expect(
    workspace.store.electionDefinition.isElectionEditable(electionId)
  ).toEqual(false);
}, 60_000);

test('an election definition cannot be finalized while VxAdmin is configured from a USB drive', async () => {
  const {
    apiClient,
    electionDefinitionApiClient: api,
    auth,
  } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await createFinalizableElection(api);
  await configureMachine(apiClient, auth, electionDefinition);
  await expect(api.finalizeElection({ electionId })).rejects.toThrow(
    'Cannot finalize an election definition while VxAdmin is configured'
  );
});

test('an election definition cannot be discarded while its election package is being built', async () => {
  const { electionDefinitionApiClient: api, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await createFinalizableElection(api);
  const render = deferred<ElectionPackageAndBallotsOutput>();
  vi.mocked(renderElectionPackageAndBallots).mockReturnValueOnce(
    render.promise
  );

  await api.finalizeElection({ electionId });
  expect(await api.getElectionPackageRenderingStatus({ electionId })).toEqual({
    status: 'running',
  });
  await expect(api.deleteElection({ electionId })).rejects.toThrow(
    'Cannot discard an election definition while its election package is being built'
  );

  await vi.waitFor(() =>
    expect(vi.mocked(renderElectionPackageAndBallots)).toHaveBeenCalled()
  );
  render.reject(new Error('stopped'));
  await waitForElectionPackage(api, electionId);
  await api.deleteElection({ electionId });
  expect(await api.getCurrentInProgressElection()).toEqual(null);
});

test('VxAdmin cannot be configured from a USB drive while an election definition is being finalized', async () => {
  const {
    apiClient,
    electionDefinitionApiClient: api,
    auth,
  } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await createFinalizableElection(api);
  const render = deferred<ElectionPackageAndBallotsOutput>();
  vi.mocked(renderElectionPackageAndBallots).mockReturnValueOnce(
    render.promise
  );
  await api.finalizeElection({ electionId });
  await vi.waitFor(() =>
    expect(vi.mocked(renderElectionPackageAndBallots)).toHaveBeenCalled()
  );

  const electionFilePath = saveTmpFile(
    await createElectionPackageZipArchive({ electionDefinition }),
    '.zip'
  );
  await suppressingConsoleOutput(() =>
    expect(apiClient.configure({ electionFilePath })).rejects.toThrow(
      'Cannot configure VxAdmin while an election definition is being finalized'
    )
  );
  await suppressingConsoleOutput(() =>
    expect(apiClient.unconfigure()).rejects.toThrow(
      'Cannot unconfigure VxAdmin while an election definition is being finalized'
    )
  );
  expect(await apiClient.getCurrentElectionMetadata()).toEqual(null);

  render.reject(new Error('stopped'));
  await waitForElectionPackage(api, electionId);
});

test('getElectionPackageRenderingStatus rejects an unknown election definition', async () => {
  const { electionDefinitionApiClient: api, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  await api.createInProgressElection();
  await expect(
    api.getElectionPackageRenderingStatus({ electionId: 'missing' })
  ).rejects.toThrow('Election definition not found');
});
