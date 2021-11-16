import { WritableStream } from 'memory-streams';
import { promises as fs } from 'fs';
import { join } from 'path';
import { pathExists } from 'fs-extra';
import { tmpNameSync } from 'tmp';
import {
  BallotMetadata,
  BallotType,
  PrecinctIdSchema,
  unsafeParse,
} from '@votingworks/types';
import { asElectionDefinition } from '@votingworks/fixtures';
import { loadImageData } from '../util/images';
import { Store } from '../store';
import {
  election,
  ballotPdf,
} from '../../test/fixtures/choctaw-2020-09-22-f30480cc99';
import { main } from './render_pages';

function fakeOutput(): WritableStream & NodeJS.WriteStream {
  return new WritableStream() as WritableStream & NodeJS.WriteStream;
}

test('fails when given no PDF paths', async () => {
  const stderr = fakeOutput();
  expect(await main([], { stderr })).not.toEqual(0);
  expect(stderr.toString()).toContain('render-pages');
});

test('prints help when asked', async () => {
  const stdout = fakeOutput();
  const stderr = fakeOutput();
  const code = await main(['--help'], { stdout, stderr });
  expect({
    code,
    stdout: stdout.toString(),
    stderr: stderr.toString(),
  }).toEqual({
    code: 0,
    stdout: expect.stringContaining('render-pages'),
    stderr: '',
  });
});

test('generates one PNG image per PDF page', async () => {
  const tmpDir = tmpNameSync();
  await fs.mkdir(tmpDir);
  const tmpBallotPath = join(tmpDir, 'ballot.pdf');
  await fs.copyFile(ballotPdf, tmpBallotPath);

  const stdout = fakeOutput();
  const stderr = fakeOutput();
  const code = await main([tmpBallotPath], { stdout, stderr });
  expect({
    code,
    stdout: stdout.toString(),
    stderr: stderr.toString(),
  }).toEqual({
    code: 0,
    stdout: `📝 ${join(tmpDir, 'ballot-p1.jpg')}\n📝 ${join(
      tmpDir,
      'ballot-p2.jpg'
    )}\n`,
    stderr: '',
  });

  for (const filename of ['ballot-p1.jpg', 'ballot-p2.jpg']) {
    const { width, height } = await loadImageData(join(tmpDir, filename));
    expect({ width, height }).toEqual({
      width: 1224,
      height: 1584,
    });
  }
  expect(await pathExists(join(tmpDir, 'ballot-p3.jpg'))).toBe(false);
});

test('generates one image per PDF page per DB', async () => {
  const tmpDir = tmpNameSync();
  await fs.mkdir(tmpDir);
  const tmpDbPath = join(tmpDir, 'ballots.db');
  const store = await Store.fileStore(tmpDbPath);
  await store.setElection(asElectionDefinition(election));
  const metadata: BallotMetadata = {
    ballotStyleId: '1',
    ballotType: BallotType.Standard,
    electionHash: '',
    isTestMode: false,
    locales: { primary: 'en-US' },
    precinctId: unsafeParse(PrecinctIdSchema, '6538'),
  };
  await store.addHmpbTemplate(await fs.readFile(ballotPdf), metadata, [
    {
      ballotImage: {
        imageData: { width: 1, height: 1 },
        metadata: { ...metadata, pageNumber: 1 },
      },
      contests: [],
    },
    {
      ballotImage: {
        imageData: { width: 1, height: 1 },
        metadata: { ...metadata, pageNumber: 2 },
      },
      contests: [],
    },
  ]);

  const stdout = fakeOutput();
  const stderr = fakeOutput();
  const code = await main([tmpDbPath], { stdout, stderr });
  expect({
    code,
    stdout: stdout.toString(),
    stderr: stderr.toString(),
  }).toEqual({
    code: 0,
    stdout: `📝 ${join(tmpDir, 'ballots-1-Bywy-LIVE-p1.jpg')}\n📝 ${join(
      tmpDir,
      'ballots-1-Bywy-LIVE-p2.jpg'
    )}\n`,
    stderr: '',
  });

  for (const filename of [
    'ballots-1-Bywy-LIVE-p1.jpg',
    'ballots-1-Bywy-LIVE-p2.jpg',
  ]) {
    const { width, height } = await loadImageData(join(tmpDir, filename));
    expect({ width, height }).toEqual({
      width: 1224,
      height: 1584,
    });
  }
  expect(await pathExists(join(tmpDir, 'ballots-1-Bywy-LIVE-p3.jpg'))).toBe(
    false
  );
});

test('fails with unknown file types', async () => {
  const stdout = fakeOutput();
  const stderr = fakeOutput();

  expect(await main(['ballots.txt'], { stdout, stderr })).toEqual(1);
  expect(stderr.toString()).toEqual(
    '✘ ballots.txt is not a known template container type\n'
  );
});

test('fails when a DB has no election', async () => {
  const stdout = fakeOutput();
  const stderr = fakeOutput();
  const tmpDir = tmpNameSync();
  await fs.mkdir(tmpDir);
  const store = await Store.fileStore(join(tmpDir, 'ballots.db'));

  expect(await main([store.getDbPath()], { stdout, stderr })).toEqual(1);
  expect(stderr.toString()).toEqual(
    `✘ ${store.getDbPath()} has no election definition\n`
  );
});
