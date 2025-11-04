import { afterAll, expect, test } from 'vitest';
import { ElectionIdSchema, unsafeParse } from '@votingworks/types';
import { ok } from '@votingworks/basics';
import { readFixture, testSetupHelpers } from '../test/helpers';
import { orgs, vxUser } from '../test/mocks';

const { setupApp, cleanup } = testSetupHelpers();

afterAll(cleanup);

test('load MS SEMS election', async () => {
  const { apiClient, auth0 } = await setupApp(orgs);
  auth0.setLoggedInUser(vxUser);

  const electionId = unsafeParse(ElectionIdSchema, 'election-1');
  const result = await apiClient.loadElection({
    newId: electionId,
    orgId: vxUser.orgId,
    upload: {
      format: 'ms-sems',
      electionFileContents: readFixture('ms-sems-election-general-10.csv'),
      candidateFileContents: readFixture(
        'ms-sems-election-candidates-general-10.csv'
      ),
    },
  });
  expect(result).toEqual(ok(electionId));
});

test('returns errors when loading invalid MS SEMS election', async () => {
  const { apiClient, auth0 } = await setupApp(orgs);
  auth0.setLoggedInUser(vxUser);

  const result = await apiClient.loadElection({
    newId: unsafeParse(ElectionIdSchema, 'election-2'),
    orgId: vxUser.orgId,
    upload: {
      format: 'ms-sems',
      // Corrupt the election file by truncating it prematurely
      electionFileContents: readFixture(
        'ms-sems-election-general-10.csv'
      ).substring(0, 50),
      candidateFileContents: readFixture(
        'ms-sems-election-candidates-general-10.csv'
      ),
    },
  });
  expect(result.err()).toMatchInlineSnapshot(
    `[Error: Quote Not Closed: the parsing is finished with an opening quote at line 2]`
  );
});
