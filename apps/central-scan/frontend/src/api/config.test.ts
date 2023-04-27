import fetchMock from 'fetch-mock';
import { electionSampleDefinition as testElectionDefinition } from '@votingworks/fixtures';
import { typedAs } from '@votingworks/basics';
import { Scan } from '@votingworks/api';
import * as config from './config';

test('GET /config/election', async () => {
  fetchMock.getOnce('/central-scanner/config/election', testElectionDefinition);
  expect(await config.getElectionDefinition()).toEqual(testElectionDefinition);
});

test('DELETE /config/election to delete election', async () => {
  fetchMock.deleteOnce('/central-scanner/config/election', {
    body: typedAs<Scan.DeleteElectionConfigResponse>({ status: 'ok' }),
  });
  await config.deleteElection();
});
