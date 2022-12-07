import { WritableStream } from 'memory-streams';
import { promises as fs } from 'fs';
import { join } from 'path';
import { pathExists } from 'fs-extra';
import { tmpNameSync } from 'tmp';
import { BallotMetadata, BallotType } from '@votingworks/types';
import { asElectionDefinition } from '@votingworks/fixtures';
import { loadImageData } from '@votingworks/image-utils';
import { Store } from '../store';
import {
  election,
  ballotPdf,
} from '../../test/fixtures/choctaw-2020-09-22-f30480cc99';
import { main } from './render_pages';
import { getMockBallotPageLayoutsWithImages } from '../../test/helpers/mock_layouts';

function fakeOutput(): WritableStream & NodeJS.WriteStream {
  return new WritableStream() as WritableStream & NodeJS.WriteStream;
}

test('no paths', async () => {
  const stderr = fakeOutput();
  expect(await main([], { stderr })).not.toEqual(0);
  expect(stderr.toString()).toContain('render-pages');
});

test('--help', async () => {
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

test('render from PDF to JPEG by default', async () => {
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

test('--format jpeg', async () => {
  const tmpDir = tmpNameSync();
  await fs.mkdir(tmpDir);
  const tmpBallotPath = join(tmpDir, 'ballot.pdf');
  await fs.copyFile(ballotPdf, tmpBallotPath);

  const stdout = fakeOutput();
  const stderr = fakeOutput();
  const code = await main([tmpBallotPath, '--format', 'jpeg'], {
    stdout,
    stderr,
  });
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

test('--format png', async () => {
  const tmpDir = tmpNameSync();
  await fs.mkdir(tmpDir);
  const tmpBallotPath = join(tmpDir, 'ballot.pdf');
  await fs.copyFile(ballotPdf, tmpBallotPath);

  const stdout = fakeOutput();
  const stderr = fakeOutput();
  const code = await main([tmpBallotPath, '--format', 'png'], {
    stdout,
    stderr,
  });
  expect({
    code,
    stdout: stdout.toString(),
    stderr: stderr.toString(),
  }).toEqual({
    code: 0,
    stdout: `📝 ${join(tmpDir, 'ballot-p1.png')}\n📝 ${join(
      tmpDir,
      'ballot-p2.png'
    )}\n`,
    stderr: '',
  });

  for (const filename of ['ballot-p1.png', 'ballot-p2.png']) {
    const { width, height } = await loadImageData(join(tmpDir, filename));
    expect({ width, height }).toEqual({
      width: 1224,
      height: 1584,
    });
  }
  expect(await pathExists(join(tmpDir, 'ballot-p3.png'))).toBe(false);
});

test('invalid --format value', async () => {
  const stdout = fakeOutput();
  const stderr = fakeOutput();
  const code = await main(['ballot.pdf', '--format', 'heif'], {
    stdout,
    stderr,
  });
  expect({
    code,
    stdout: stdout.toString(),
    stderr: stderr.toString(),
  }).toEqual({
    code: -1,
    stdout: '',
    stderr: 'error: invalid value "heif" for option "--format"',
  });
});

test('render from db', async () => {
  const tmpDir = tmpNameSync();
  await fs.mkdir(tmpDir);
  const tmpDbPath = join(tmpDir, 'ballots.db');
  const store = await Store.fileStore(tmpDbPath);
  const electionDefinition = asElectionDefinition(election);
  store.setElection(electionDefinition.electionData);
  const metadata: BallotMetadata = {
    ballotStyleId: '1',
    ballotType: BallotType.Standard,
    electionHash: electionDefinition.electionHash,
    isTestMode: false,
    locales: { primary: 'en-US' },
    precinctId: '6538',
  };
  store.addHmpbTemplate(
    await fs.readFile(ballotPdf),
    metadata,
    getMockBallotPageLayoutsWithImages(metadata, 2)
  );

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

test('unknown file types', async () => {
  const stdout = fakeOutput();
  const stderr = fakeOutput();

  expect(await main(['ballots.txt'], { stdout, stderr })).toEqual(1);
  expect(stderr.toString()).toEqual(
    '✘ ballots.txt is not a known template container type\n'
  );
});

test('db without an election', async () => {
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
