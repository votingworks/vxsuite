import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { dirSync, fileSync } from 'tmp';
import { Store } from '../store';
import { call, InterpretOutput } from './interpret_nh';

test('configure', async () => {
  const dbPath = fileSync().name;
  await expect(call({ action: 'configure', dbPath })).resolves.not.toThrow();
});

test('interpret', async () => {
  const dbPath = fileSync().name;
  const ballotImagesPath = dirSync().name;
  const store = Store.fileStore(dbPath);

  const { electionDefinition } = electionGridLayoutNewHampshireAmherstFixtures;
  store.setElection(electionDefinition);
  await call({ action: 'configure', dbPath });

  const result = (await call({
    action: 'interpret',
    frontImagePath:
      electionGridLayoutNewHampshireAmherstFixtures.scanMarkedFront.asFilePath(),
    backImagePath:
      electionGridLayoutNewHampshireAmherstFixtures.scanMarkedBack.asFilePath(),
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
