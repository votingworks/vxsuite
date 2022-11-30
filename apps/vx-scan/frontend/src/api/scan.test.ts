import { electionWithMsEitherNeitherFixtures } from '@votingworks/fixtures';
import { CastVoteRecord } from '@votingworks/types';
import fetchMock from 'fetch-mock';
import * as scan from './scan';

test('calibrate success', async () => {
  fetchMock.postOnce('/precinct-scanner/scanner/calibrate', {
    body: { status: 'ok' },
  });
  await scan.calibrate();
  expect(fetchMock.done()).toBe(true);
});

test('getExportWithoutImages returns CVRs on success', async () => {
  const fileContent = electionWithMsEitherNeitherFixtures.cvrData;
  fetchMock.postOnce('/precinct-scanner/export', fileContent);
  const cvrsFileString = await scan.getExportWithoutImages();
  const lines = cvrsFileString.split('\n');
  const cvrs = lines.flatMap((line) =>
    line.length > 0 ? (JSON.parse(line) as CastVoteRecord) : []
  );
  expect(cvrs).toHaveLength(100);
});

test('getExportWithoutImages specifies to skip images in request', async () => {
  fetchMock.postOnce(
    { url: '/precinct-scanner/export', body: { skipImages: true } },
    'anything'
  );
  await scan.getExportWithoutImages();
});

test('getExport throws on failure', async () => {
  fetchMock.postOnce('/precinct-scanner/export', {
    status: 500,
    body: { status: 'error' },
  });
  await expect(scan.getExportWithoutImages()).rejects.toThrowError(
    'failed to generate scan export'
  );
});
