import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DateWithoutTime, err, ok } from '@votingworks/basics';
import {
  type ElectionInfoUpdate,
  stateFeatureConfigs,
} from '@votingworks/election-definition-backend';
import { describeElectionDefinitionMethods } from '@votingworks/election-definition-backend/test-utils';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import { LanguageCode, type Precinct } from '@votingworks/types';
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
