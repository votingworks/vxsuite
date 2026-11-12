import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { err, ok, typedAs } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  makeTemporaryFile,
  makeTemporaryPath,
} from '@votingworks/fixtures';
import { type ReadElectionError, readElection } from './election.js';

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

test('invalid UTF-8', async () => {
  const path = makeTemporaryFile({ content: Buffer.from([0x7b, 0xff, 0x7d]) });
  expect(await readElection(path)).toEqual(
    err(
      typedAs<ReadElectionError>({
        type: 'ParseError',
        error: expect.any(TypeError),
      })
    )
  );
});

test('byte order mark', async () => {
  const path = makeTemporaryFile({
    content: Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(electionFamousNames2021Fixtures.electionJson.asText()),
    ]),
  });
  expect(await readElection(path)).toEqual(
    err(
      typedAs<ReadElectionError>({
        type: 'ParseError',
        error: expect.any(SyntaxError),
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

test('success', async () => {
  const path = makeTemporaryFile({
    content: electionFamousNames2021Fixtures.electionJson.asText(),
  });
  expect(await readElection(path)).toEqual(
    ok(electionFamousNames2021Fixtures.readElectionDefinition())
  );
});
