import { expect, test } from 'vitest';
import { err, ok, typedAs } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  makeTemporaryFile,
  makeTemporaryPath,
} from '@votingworks/fixtures';
import { ReadElectionError, readElection } from './election';

test('syntax error', async () => {
  const path = makeTemporaryFile({ content: 'invalid json' });
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
  const path = makeTemporaryFile({ content: '{"invalid": "election"}' });
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
  const path = makeTemporaryPath();
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
  const path = makeTemporaryFile({ content: 'a'.repeat(30 * 1024 * 1024 + 1) });
  expect(await readElection(path)).toEqual(
    err(
      typedAs<ReadElectionError>({
        type: 'ReadFileError',
        error: {
          type: 'FileExceedsMaxSize',
          maxSize: 30 * 1024 * 1024,
          fileSize: 30 * 1024 * 1024 + 1,
        },
      })
    )
  );
});

test('success', async () => {
  const path = makeTemporaryFile({
    content: electionFamousNames2021Fixtures.electionJson.asText(),
  });
  expect(await readElection(path)).toEqual(
    ok(electionFamousNames2021Fixtures.readElectionDefinition())
  );
});
