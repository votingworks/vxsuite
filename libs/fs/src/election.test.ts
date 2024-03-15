import { err, ok, typedAs } from '@votingworks/basics';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { writeFileSync } from 'fs';
import { tmpNameSync } from 'tmp';
import { ReadElectionError, readElection } from './election';

test('syntax error', async () => {
  const path = tmpNameSync();
  writeFileSync(path, 'invalid json');
  expect(await readElection(path)).toEqual(
    err(
      typedAs<ReadElectionError>({
        type: 'ParseError',
        error: expect.any(SyntaxError),
      })
    )
  );
});

test('parse error', async () => {
  const path = tmpNameSync();
  writeFileSync(path, '{"invalid": "election"}');
  expect(await readElection(path)).toEqual(
    err(
      typedAs<ReadElectionError>({
        type: 'ParseError',
        error: expect.any(Error),
      })
    )
  );
});

test('file system error: no such file', async () => {
  const path = tmpNameSync();
  expect(await readElection(path)).toEqual(
    err(
      typedAs<ReadElectionError>({
        type: 'ReadFileError',
        error: {
          type: 'OpenFileError',
          error: expect.objectContaining({ code: 'ENOENT' }),
        },
      })
    )
  );
});

test('file system error: file exceeds max size', async () => {
  const path = tmpNameSync();
  writeFileSync(path, 'a'.repeat(10 * 1024 * 1024 + 1));
  expect(await readElection(path)).toEqual(
    err(
      typedAs<ReadElectionError>({
        type: 'ReadFileError',
        error: {
          type: 'FileExceedsMaxSize',
          maxSize: 10 * 1024 * 1024,
          fileSize: 10 * 1024 * 1024 + 1,
        },
      })
    )
  );
});

test('success', async () => {
  const path = tmpNameSync();
  const contents = electionFamousNames2021Fixtures.electionJson.asText();
  writeFileSync(path, contents);
  expect(await readElection(path)).toEqual(
    ok(electionFamousNames2021Fixtures.electionDefinition)
  );
});
