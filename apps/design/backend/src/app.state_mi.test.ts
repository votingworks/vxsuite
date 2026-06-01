import { afterAll, expect, test } from 'vitest';
import { electionGeneralFixtures } from '@votingworks/fixtures';
import { testSetupHelpers } from '../test/helpers';
import {
  jurisdictions,
  miJurisdiction,
  nonVxOrganization,
  organizations,
  users,
} from '../test/mocks';
import { JurisdictionUser } from './types';

const { setupApp, cleanup } = testSetupHelpers();

afterAll(cleanup);

const miUser: JurisdictionUser = {
  type: 'jurisdiction_user',
  name: 'mi.user@example.com',
  id: 'auth0|mi-user-id',
  organization: nonVxOrganization,
  jurisdictions: [miJurisdiction],
};

test('listContests injects a straight-party contest for MI general elections', async () => {
  // Michigan has the STRAIGHT_PARTY_VOTING state feature enabled, so a
  // straight-party contest is injected at materialization time.
  const { election } = electionGeneralFixtures.readElectionDefinition();
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users: [...users, miUser],
  });
  auth0.setLoggedInUser(miUser);

  const electionId = (
    await apiClient.loadElection({
      newId: 'mi-election-id',
      jurisdictionId: miJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: JSON.stringify(election),
      },
    })
  ).unsafeUnwrap();

  const contests = await apiClient.listContests({ electionId });
  expect(contests[0]?.type).toEqual('straight-party');
});
