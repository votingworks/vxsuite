import { electionWithMsEitherNeitherFixtures } from '@votingworks/fixtures';
import { CastVoteRecord } from '@votingworks/types';
import fetchMock from 'fetch-mock';
import * as scan from './scan';

test('calibrate success', async () => {
  fetchMock.postOnce('/scanner/calibrate', { body: { status: 'ok' } });
  await scan.calibrate();
  expect(fetchMock.done()).toBe(true);
});

test('getExport returns CVRs on success', async () => {
  const fileContent = electionWithMsEitherNeitherFixtures.cvrData;
  fetchMock.postOnce('/scan/export', fileContent);
  const cvrsFileString = await scan.getExport();
  const lines = cvrsFileString.split('\n');
  const cvrs = lines.flatMap((line) =>
    line.length > 0 ? (JSON.parse(line) as CastVoteRecord) : []
  );
  expect(cvrs).toHaveLength(100);
});

test('getExport throws on failure', async () => {
  fetchMock.postOnce('/scan/export', {
    status: 500,
    body: { status: 'error' },
  });
  await expect(scan.getExport()).rejects.toThrowError(
    'failed to generate scan export'
  );
});
