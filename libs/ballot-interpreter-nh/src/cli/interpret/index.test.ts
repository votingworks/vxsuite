import { electionGridLayoutNewHampshireHudsonFixtures } from '@votingworks/fixtures';
import { fakeReadable, fakeWritable, mockOf } from '@votingworks/test-utils';
import {
  BallotType,
  HmpbBallotPageMetadata,
  ok,
  PageInterpretationSchema,
  PageInterpretationWithFiles,
  safeParseJson,
  VotesDict,
} from '@votingworks/types';
import { typedAs } from '@votingworks/utils';
import { z } from 'zod';
import { main } from '.';
import { Stdio } from '..';
import { interpret } from '../../interpret';
import { makeRect } from '../../utils';

jest.mock('../../interpret');

const ignoredRect = makeRect({ minX: 0, minY: 0, maxX: 0, maxY: 0 });

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[\d+m/g, '');
}

test('--help', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const exitCode = await main(['--help'], io);

  expect(io.stdout.toString()).toContain(
    'interpret [options] <election.json> <front-ballot.jpg> <back-ballot.jpg>'
  );
  expect(exitCode).toBe(0);
});

test('-h', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const exitCode = await main(['-h'], io);

  expect(io.stdout.toString()).toContain(
    'interpret [options] <election.json> <front-ballot.jpg> <back-ballot.jpg>'
  );
  expect(exitCode).toBe(0);
});

test('unexpected option', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const exitCode = await main(['--nope'], io);

  expect(io.stderr.toString()).toMatchInlineSnapshot(`
    "error: unknown option: --nope
    "
  `);
  expect(exitCode).toBe(1);
});

test('unexpected argument', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const exitCode = await main(
    ['election.json', 'front.jpeg', 'back.jpeg', 'what-is-this.json'],
    io
  );

  expect(io.stderr.toString()).toMatchInlineSnapshot(`
    "error: unexpected argument: what-is-this.json
    "
  `);
  expect(exitCode).toBe(1);
});

test('missing definition path', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const exitCode = await main(['front.jpeg', 'back.jpeg'], io);

  expect(io.stderr.toString()).toMatchInlineSnapshot(`
    "error: missing definition path
    "
  `);
  expect(exitCode).toBe(1);
});

test('missing front ballot path', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const exitCode = await main(['election.json'], io);

  expect(io.stderr.toString()).toMatchInlineSnapshot(`
    "error: missing front ballot path
    "
  `);
  expect(exitCode).toBe(1);
});

test('missing back ballot path', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const exitCode = await main(['election.json', 'front.jpeg'], io);

  expect(io.stderr.toString()).toMatchInlineSnapshot(`
    "error: missing back ballot path
    "
  `);
  expect(exitCode).toBe(1);
});

test('--mark-thresholds DEFINITE', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  // just use BlankPage because it's easy
  mockOf(interpret).mockResolvedValueOnce(
    ok([
      typedAs<PageInterpretationWithFiles>({
        interpretation: { type: 'BlankPage' },
        originalFilename: 'front.jpeg',
        normalizedFilename: 'front.jpeg',
      }),
      typedAs<PageInterpretationWithFiles>({
        interpretation: { type: 'BlankPage' },
        originalFilename: 'back.jpeg',
        normalizedFilename: 'back.jpeg',
      }),
    ])
  );

  const electionPath =
    electionGridLayoutNewHampshireHudsonFixtures.electionJson.asFilePath();
  const exitCode = await main(
    ['--mark-thresholds', '10%', electionPath, 'front.jpeg', 'back.jpeg'],
    io
  );

  // ensure the 10% threshold is applied
  expect(interpret).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
    isTestMode: true,
    markThresholds: {
      definite: 0.1,
      marginal: 0.1,
    },
  });

  expect(stripAnsi(io.stdout.toString())).toMatchInlineSnapshot(`
    "front.jpeg:
      BlankPage
    back.jpeg:
      BlankPage
    "
  `);
  expect({ exitCode, stderr: io.stderr.toString() }).toEqual({
    exitCode: 0,
    stderr: '',
  });
});

test('--mark-thresholds MARGINAL,DEFINITE', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  // just use BlankPage because it's easy
  mockOf(interpret).mockResolvedValueOnce(
    ok([
      typedAs<PageInterpretationWithFiles>({
        interpretation: { type: 'BlankPage' },
        originalFilename: 'front.jpeg',
        normalizedFilename: 'front.jpeg',
      }),
      typedAs<PageInterpretationWithFiles>({
        interpretation: { type: 'BlankPage' },
        originalFilename: 'back.jpeg',
        normalizedFilename: 'back.jpeg',
      }),
    ])
  );

  const electionPath =
    electionGridLayoutNewHampshireHudsonFixtures.electionJson.asFilePath();
  const exitCode = await main(
    ['--mark-thresholds', '5%,10%', electionPath, 'front.jpeg', 'back.jpeg'],
    io
  );

  // ensure the thresholds are applied
  expect(interpret).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
    isTestMode: true,
    markThresholds: {
      definite: 0.1,
      marginal: 0.05,
    },
  });

  expect(stripAnsi(io.stdout.toString())).toMatchInlineSnapshot(`
    "front.jpeg:
      BlankPage
    back.jpeg:
      BlankPage
    "
  `);
  expect({ exitCode, stderr: io.stderr.toString() }).toEqual({
    exitCode: 0,
    stderr: '',
  });
});

test('interpret', async () => {
  const metadata: HmpbBallotPageMetadata = {
    ballotType: BallotType.Standard,
    ballotStyleId: 'card-number-54',
    electionHash:
      '24e75b5d29a99d13d7209c413f654f9863a32f5e7b8530ead92bd7cab1974e10',
    isTestMode: false,
    locales: { primary: 'en-US' },
    pageNumber: 1,
    precinctId: 'town-id-12101-precinct-id-',
  };

  // just use BlankPage because it's easy
  mockOf(interpret).mockResolvedValue(
    ok([
      typedAs<PageInterpretationWithFiles>({
        interpretation: {
          type: 'InterpretedHmpbPage',
          adjudicationInfo: {
            enabledReasonInfos: [],
            enabledReasons: [],
            ignoredReasonInfos: [],
            requiresAdjudication: false,
          },
          markInfo: {
            ballotSize: { width: 0, height: 0 },
            marks: [
              {
                type: 'candidate',
                contestId: 'Representative-in-Congress-24683b44',
                optionId: 'Steven-Negron-5d482d72',
                bounds: ignoredRect,
                scoredOffset: { x: 0, y: 0 },
                target: {
                  bounds: ignoredRect,
                  inner: ignoredRect,
                },
                score: 0.2184,
              },
              {
                type: 'candidate',
                contestId: 'Representative-in-Congress-24683b44',
                optionId: 'Ann-McLane-Kuster-67fdf060',
                bounds: ignoredRect,
                scoredOffset: { x: 0, y: 0 },
                target: {
                  bounds: ignoredRect,
                  inner: ignoredRect,
                },
                score: 0.0412,
              },
              {
                type: 'candidate',
                contestId: 'Representative-in-Congress-24683b44',
                optionId: 'Andrew-Olding-bed33f08',
                bounds: ignoredRect,
                scoredOffset: { x: 0, y: 0 },
                target: {
                  bounds: ignoredRect,
                  inner: ignoredRect,
                },
                score: 0.0003,
              },
              {
                type: 'candidate',
                contestId: 'Representative-in-Congress-24683b44',
                optionId: 'write-in-0',
                bounds: ignoredRect,
                scoredOffset: { x: 0, y: 0 },
                target: {
                  bounds: ignoredRect,
                  inner: ignoredRect,
                },
                score: 0,
              },
            ],
          },

          metadata,
          votes: {
            'Representative-in-Congress-24683b44': [
              {
                id: 'Steven-Negron-5d482d72',
                name: 'Steven Negron',
                partyId: 'Republican-f0167ce7',
              },
            ],
          } as unknown as VotesDict,
          layout: {
            pageSize: {
              width: 1,
              height: 1,
            },
            contests: [],
            metadata,
          },
        },
        originalFilename: 'front.jpeg',
        normalizedFilename: 'front.jpeg',
      }),
      typedAs<PageInterpretationWithFiles>({
        interpretation: { type: 'BlankPage' },
        originalFilename: 'back.jpeg',
        normalizedFilename: 'back.jpeg',
      }),
    ])
  );

  const electionPath =
    electionGridLayoutNewHampshireHudsonFixtures.electionJson.asFilePath();

  {
    const io: Stdio = {
      stdin: fakeReadable(),
      stdout: fakeWritable(),
      stderr: fakeWritable(),
    };
    const exitCode = await main([electionPath, 'front.jpeg', 'back.jpeg'], io);

    expect(stripAnsi(io.stdout.toString())).toMatchInlineSnapshot(`
          "front.jpeg:
          Representative in Congress
          ✅ (21.84%) Steven Negron
          ⬜️ ( 4.12%) Ann McLane Kuster
          ⬜️ ( 0.03%) Andrew Olding
          ⬜️ ( 0.00%) Write-In #1

          back.jpeg:
            BlankPage
          "
      `);
    expect({ exitCode, stderr: io.stderr.toString() }).toEqual({
      exitCode: 0,
      stderr: '',
    });
  }

  {
    const io: Stdio = {
      stdin: fakeReadable(),
      stdout: fakeWritable(),
      stderr: fakeWritable(),
    };
    const exitCode = await main(
      [electionPath, 'front.jpeg', 'back.jpeg', '--json'],
      io
    );

    expect(
      safeParseJson(
        io.stdout.toString(),
        z.object({
          front: PageInterpretationSchema,
          back: PageInterpretationSchema,
        })
      ).unsafeUnwrap()
    ).toStrictEqual({
      front: expect.objectContaining({
        type: 'InterpretedHmpbPage',
      }),
      back: expect.objectContaining({
        type: 'BlankPage',
      }),
    });
    expect({ exitCode, stderr: io.stderr.toString() }).toEqual({
      exitCode: 0,
      stderr: '',
    });
  }
});
