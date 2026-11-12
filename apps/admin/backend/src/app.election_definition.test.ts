import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DateWithoutTime, err, ok } from '@votingworks/basics';
import {
  type ElectionInfoUpdate,
  getStateFeaturesConfig,
  stateFeatureConfigs,
} from '@votingworks/election-definition-backend';
import { describeElectionDefinitionMethods } from '@votingworks/election-definition-backend/test-utils';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import {
  type CandidateContest,
  type Contest,
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
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
  mockSystemAdministratorAuth,
} from '../test/app.js';

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
    };
  }
);

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
      registeredVoterCounts: 100,
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
    'precinct-1': 100,
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
      registeredVoterCounts: { splits: { 'split-1': 60 } },
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
    'precinct-1': { splits: { 'split-1': 60 } },
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
