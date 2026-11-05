import { randomUUID } from 'node:crypto';
import { afterAll } from 'vitest';
import { stateFeatureConfigs } from '@votingworks/election-definition-backend';
import { describeElectionDefinitionMethods } from '@votingworks/election-definition-backend/test-utils';
import { testSetupHelpers } from '../test/helpers.js';
import {
  jurisdictions,
  nonVxJurisdiction,
  nonVxUser,
  organizations,
  users,
} from '../test/mocks.js';

const { setupApp, cleanup } = testSetupHelpers();

afterAll(cleanup);

describeElectionDefinitionMethods(async () => {
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);
  return {
    methods: apiClient,
    async createElection() {
      const electionId = randomUUID();
      (
        await apiClient.createElection({
          jurisdictionId: nonVxJurisdiction.id,
          id: electionId,
        })
      ).unsafeUnwrap();
      await apiClient.setBallotTemplate({
        electionId,
        ballotTemplateId: 'NhBallot',
      });
      return electionId;
    },
    expectedStateFeatures: stateFeatureConfigs.DEMO,
  };
});
