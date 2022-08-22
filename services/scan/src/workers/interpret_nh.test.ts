import { dirSync, fileSync } from 'tmp';
import { join } from 'path';
import { safeParseElectionDefinition } from '@votingworks/types';
import { readdir, readFile } from 'fs/promises';
import { call, InterpretOutput } from './interpret_nh';
import { Store } from '../store';

const AMHERST_ELECTION = join(
  __dirname,
  '../../../../libs/ballot-interpreter-nh/test/fixtures/amherst-2022-07-12/election.json'
);

const AMHERST_FRONT = join(
  __dirname,
  '../../../../libs/ballot-interpreter-nh/test/fixtures/amherst-2022-07-12/scan-marked-front.jpeg'
);

const AMHERST_BACK = join(
  __dirname,
  '../../../../libs/ballot-interpreter-nh/test/fixtures/amherst-2022-07-12/scan-marked-back.jpeg'
);

test('configure', async () => {
  const dbPath = fileSync().name;
  await expect(call({ action: 'configure', dbPath })).resolves.not.toThrow();
});

test('interpret', async () => {
  jest.setTimeout(10_000);
  const dbPath = fileSync().name;
  const ballotImagesPath = dirSync().name;
  const store = Store.fileStore(dbPath);

  const electionDefinition = safeParseElectionDefinition(
    await readFile(AMHERST_ELECTION, 'utf8')
  ).unsafeUnwrap();
  store.setElection(electionDefinition);
  await call({ action: 'configure', dbPath });

  const result = (await call({
    action: 'interpret',
    frontImagePath: AMHERST_FRONT,
    backImagePath: AMHERST_BACK,
    ballotImagesPath,
    interpreter: 'nh',
    sheetId: 'test-sheet',
  })) as InterpretOutput;

  const [frontResult, backResult] = result.unsafeUnwrap();

  expect(frontResult.interpretation.type).toBe('InterpretedHmpbPage');
  expect(backResult.interpretation.type).toBe('InterpretedHmpbPage');

  const images = (await readdir(ballotImagesPath)).map((filename) =>
    join(ballotImagesPath, filename)
  );
  expect(images).toContain(frontResult.originalFilename);
  expect(images).toContain(frontResult.normalizedFilename);
  expect(images).toContain(backResult.originalFilename);
  expect(images).toContain(backResult.normalizedFilename);
});
