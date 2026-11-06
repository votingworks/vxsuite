import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DateWithoutTime, err, ok } from '@votingworks/basics';
import {
  type ElectionInfoUpdate,
  stateFeatureConfigs,
} from '@votingworks/election-definition-backend';
import { describeElectionDefinitionMethods } from '@votingworks/election-definition-backend/test-utils';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import { LanguageCode } from '@votingworks/types';
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
  vi.stubEnv('VX_MACHINE_JURISDICTION', 'vx.test');
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-05T12:00:00') });
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('election definition methods', () => {
  describeElectionDefinitionMethods(() => {
    const { apiClient, auth } = buildTestEnvironment();
    mockSystemAdministratorAuth(auth);
    return {
      methods: apiClient,
      createElection: () => apiClient.createInProgressElection(),
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
  const { apiClient, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  expect(await apiClient.isElectionDefinitionEnabled()).toEqual(false);
  await expect(apiClient.getCurrentInProgressElection()).rejects.toThrow(
    'election-definition:disabled'
  );
});

test('requires a system administrator', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await expect(apiClient.getCurrentInProgressElection()).rejects.toThrow(
    'auth:forbidden'
  );

  mockElectionManagerAuth(auth, electionDefinition.election);
  await expect(apiClient.createInProgressElection()).rejects.toThrow(
    'auth:forbidden'
  );
});

test('create, edit and discard an election definition', async () => {
  const { apiClient: api, auth, logger } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  expect(await api.isElectionDefinitionEnabled()).toEqual(true);
  expect(await api.getCurrentInProgressElection()).toEqual(null);

  const electionId = await api.createInProgressElection();
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.ElectionDefinitionCreated,
    {
      message: `Created election definition ${electionId}.`,
      disposition: 'success',
    }
  );
  expect(await api.getCurrentInProgressElection()).toEqual(
    await api.getElectionInfo({ electionId })
  );
  expect(await api.getElectionInfo({ electionId })).toEqual({
    electionId,
    type: 'general',
    date: new DateWithoutTime('2026-11-05'),
    title: '',
    state: 'DEMO',
    jurisdictionName: '',
    seal: '',
    languageCodes: [LanguageCode.ENGLISH],
  });
  expect(await api.getStateFeatures({ electionId })).toEqual({
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
  expect(await api.updateElectionInfo(electionInfoUpdate)).toEqual(ok());
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.ElectionDefinitionInfoUpdated,
    {
      message: `Updated election info for election definition ${electionId}.`,
      disposition: 'success',
    }
  );
  expect(await api.getElectionInfo({ electionId })).toEqual({
    ...electionInfoUpdate,
    title: 'Primary Election',
  });
  expect(await api.getCurrentInProgressElection()).toEqual({
    ...electionInfoUpdate,
    title: 'Primary Election',
  });

  const {
    signatureImage: _signatureImage,
    signatureCaption: _signatureCaption,
    ...withoutSignature
  } = electionInfoUpdate;
  expect(await api.updateElectionInfo(withoutSignature)).toEqual(ok());
  expect(await api.getElectionInfo({ electionId })).toEqual({
    ...withoutSignature,
    title: 'Primary Election',
  });

  await api.discardInProgressElection();
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.ElectionDefinitionDiscarded,
    {
      message: `Discarded election definition ${electionId}.`,
      disposition: 'success',
    }
  );
  expect(await api.getCurrentInProgressElection()).toEqual(null);
});

test('discarding with no election definition is a no-op', async () => {
  const { apiClient: api, auth, logger } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  await api.discardInProgressElection();
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.ElectionDefinitionDiscarded,
    {
      message: 'No election definition to discard.',
      disposition: 'success',
    }
  );
});

test('only one election definition at a time', async () => {
  const { apiClient: api, auth, logger } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  await api.createInProgressElection();
  await suppressingConsoleOutput(() =>
    expect(api.createInProgressElection()).rejects.toThrow(
      'An election definition already exists.'
    )
  );
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionCreated,
    {
      message:
        'Error creating election definition: An election definition already exists.',
      disposition: 'failure',
    }
  );
});

test('cannot create an election definition while configured', async () => {
  const { apiClient: api, auth } = buildTestEnvironment();
  await configureMachine(api, auth, electionDefinition);
  mockSystemAdministratorAuth(auth);

  await suppressingConsoleOutput(() =>
    expect(api.createInProgressElection()).rejects.toThrow(
      'Cannot create an election definition while an election is configured.'
    )
  );
});

test('rejects requests for another election', async () => {
  const { apiClient: api, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  await suppressingConsoleOutput(() =>
    expect(api.getElectionInfo({ electionId: 'missing' })).rejects.toThrow(
      'Election definition not found'
    )
  );

  await api.createInProgressElection();
  await suppressingConsoleOutput(() =>
    expect(api.getStateFeatures({ electionId: 'missing' })).rejects.toThrow(
      'Election definition not found'
    )
  );
});

test('unconfiguring removes the election definition', async () => {
  const { apiClient: api, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  await api.createInProgressElection();

  await api.unconfigure();
  expect(await api.getCurrentInProgressElection()).toEqual(null);
});

test('unsupported machine state', async () => {
  vi.stubEnv('VX_MACHINE_JURISDICTION', 'mi.kent');
  const { apiClient: api, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  expect(await api.isElectionDefinitionEnabled()).toEqual(false);
  await expect(api.createInProgressElection()).rejects.toThrow(
    'election-definition:disabled'
  );
});

test('rejects combined ballot primaries', async () => {
  const { apiClient: api, auth, logger } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await api.createInProgressElection();
  const electionInfo = await api.getElectionInfo({ electionId });

  await suppressingConsoleOutput(() =>
    expect(
      api.updateElectionInfo({
        ...electionInfo,
        title: 'Primary Election',
        jurisdictionName: 'Demo County',
        type: 'primary',
        isMiCombinedBallotPrimary: true,
      })
    ).rejects.toThrow('Combined ballot primaries are not supported.')
  );
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionInfoUpdated,
    {
      message: `Error updating election info for election definition ${electionId}: Combined ballot primaries are not supported.`,
      disposition: 'failure',
    }
  );
});

test('edit districts', async () => {
  const { apiClient: api, auth, logger } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await api.createInProgressElection();
  expect(await api.listDistricts({ electionId })).toEqual([]);

  expect(
    await api.updateDistricts({
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
    await api.updateDistricts({
      electionId,
      deletedDistrictIds: ['district-1'],
      updatedDistricts: [{ id: 'district-2', name: 'District 1' }],
    })
  ).toEqual(ok());
  expect(await api.listDistricts({ electionId })).toEqual([
    { id: 'district-2', name: 'District 1' },
  ]);
});

test('rejects duplicate district names', async () => {
  const { apiClient: api, auth, logger } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await api.createInProgressElection();
  (
    await api.updateDistricts({
      electionId,
      newDistricts: [{ id: 'district-1', name: 'District 1' }],
    })
  ).unsafeUnwrap();

  expect(
    await api.updateDistricts({
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
  expect(await api.listDistricts({ electionId })).toEqual([
    { id: 'district-1', name: 'District 1' },
  ]);
});

test('rejects invalid districts', async () => {
  const { apiClient: api, auth, logger } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);
  const electionId = await api.createInProgressElection();

  await suppressingConsoleOutput(() =>
    expect(
      api.updateDistricts({
        electionId,
        newDistricts: [{ id: 'district-1', name: '' }],
      })
    ).rejects.toThrow()
  );
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionDistrictsUpdated,
    expect.objectContaining({ disposition: 'failure' })
  );

  await suppressingConsoleOutput(() =>
    expect(
      api.updateDistricts({
        electionId: 'missing',
        newDistricts: [{ id: 'district-1', name: 'District 1' }],
      })
    ).rejects.toThrow('Election definition not found')
  );
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionDefinitionDistrictsUpdated,
    {
      message:
        'Error updating districts for election definition missing: Election definition not found',
      disposition: 'failure',
    }
  );
  await suppressingConsoleOutput(() =>
    expect(api.listDistricts({ electionId: 'missing' })).rejects.toThrow(
      'Election definition not found'
    )
  );
  expect(await api.listDistricts({ electionId })).toEqual([]);
});
