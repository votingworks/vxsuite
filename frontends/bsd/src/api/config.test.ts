import fetchMock from 'fetch-mock';
import { electionSampleDefinition as testElectionDefinition } from '@votingworks/fixtures';
import { typedAs } from '@votingworks/utils';
import { Scan } from '@votingworks/api';
import * as config from './config';

test('GET /config/election', async () => {
  fetchMock.getOnce('/config/election', testElectionDefinition);
  expect(await config.getElectionDefinition()).toEqual(testElectionDefinition);
});

test('PATCH /config/election', async () => {
  fetchMock.patchOnce('/config/election', {
    body: typedAs<Scan.PatchElectionConfigResponse>({ status: 'ok' }),
  });
  await config.setElection(testElectionDefinition.electionData);
});

test('PATCH /config/election fails', async () => {
  fetchMock.patchOnce(
    '/config/election',
    new Response(
      JSON.stringify(
        typedAs<Scan.PatchElectionConfigResponse>({
          status: 'error',
          errors: [{ type: 'invalid-value', message: 'bad election!' }],
        })
      ),
      { status: 400 }
    )
  );
  await expect(
    config.setElection(testElectionDefinition.electionData)
  ).rejects.toThrowError('bad election!');
});

test('DELETE /config/election to delete election', async () => {
  fetchMock.deleteOnce('/config/election', {
    body: typedAs<Scan.DeleteElectionConfigResponse>({ status: 'ok' }),
  });
  await config.setElection(undefined);
});
