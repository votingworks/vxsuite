import { Buffer } from 'buffer';
import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleFixtures,
} from '@votingworks/fixtures';
import { BallotType, SheetOf } from '@votingworks/types';
import {
  castVoteRecordHasWriteIns,
  readBallotPackageFromBuffer,
  takeAsync,
  throwIllegalValue,
} from '@votingworks/utils';
import { generateCvrs } from './generate_cvrs';

test('fails on ballot package with more than one sheet', async () => {
  await expect(
    async () =>
      await takeAsync(
        Infinity,
        generateCvrs({
          ballotPackage: {
            electionDefinition:
              electionFamousNames2021Fixtures.electionDefinition,
            ballots: [
              {
                pdf: Buffer.of(0x01, 0x02, 0x03),
                ballotConfig: {
                  ballotStyleId:
                    electionFamousNames2021Fixtures.election.ballotStyles[0]!
                      .id,
                  precinctId:
                    electionFamousNames2021Fixtures.election.precincts[0]!.id,
                  filename: 'ballot.pdf',
                  layoutFilename: 'layout.json',
                  locales: { primary: 'en-US' },
                  isAbsentee: false,
                  isLiveMode: false,
                  contestIds: [],
                },
                layout: Array.from({ length: 4 }, (_, i) => ({
                  contests: [],
                  metadata: {
                    ballotStyleId:
                      electionFamousNames2021Fixtures.election.ballotStyles[0]!
                        .id,
                    precinctId:
                      electionFamousNames2021Fixtures.election.precincts[0]!.id,
                    ballotType: BallotType.Standard,
                    locales: { primary: 'en-US' },
                    electionHash:
                      electionFamousNames2021Fixtures.electionDefinition
                        .electionHash,
                    isTestMode: true,
                    pageNumber: i + 1,
                  },
                  pageSize: { width: 850, height: 1100 },
                })),
              },
            ],
          },
          scannerNames: ['scanner-1'],
          testMode: true,
        })
      )
  ).rejects.toThrowError('only single-sheet ballots are supported');
});

test('has all ballot types', async () => {
  let seenAbsentee = false;
  let seenProvisional = false;
  let seenStandard = false;

  for await (const cvr of generateCvrs({
    ballotPackage: await readBallotPackageFromBuffer(
      electionMinimalExhaustiveSampleFixtures.ballotPackage.asBuffer()
    ),
    scannerNames: ['scanner-1'],
    testMode: false,
  })) {
    switch (cvr._ballotType) {
      case 'absentee':
        seenAbsentee = true;
        break;

      case 'provisional':
        seenProvisional = true;
        break;

      case 'standard':
        seenStandard = true;
        break;

      default:
        throwIllegalValue(cvr._ballotType);
    }

    if (seenAbsentee && seenProvisional && seenStandard) {
      break;
    }
  }

  expect(seenAbsentee).toEqual(true);
  expect(seenProvisional).toEqual(true);
  expect(seenStandard).toEqual(true);
});

test('uses all the scanners given', async () => {
  const scanners = new Set<string>();

  for await (const cvr of generateCvrs({
    ballotPackage: await readBallotPackageFromBuffer(
      electionMinimalExhaustiveSampleFixtures.ballotPackage.asBuffer()
    ),
    scannerNames: ['scanner-1', 'scanner-2'],
    testMode: false,
  })) {
    scanners.add(cvr._scannerId);
  }

  expect([...scanners].sort()).toStrictEqual(['scanner-1', 'scanner-2']);
});

test('records have votes for consecutive pages', async () => {
  const ballotPackage = await readBallotPackageFromBuffer(
    electionFamousNames2021Fixtures.ballotPackage.asBuffer()
  );

  for await (const cvr of generateCvrs({
    ballotPackage,
    scannerNames: ['scanner-1'],
    testMode: false,
  })) {
    const pageNumbers = cvr._pageNumbers as SheetOf<number>;

    expect(pageNumbers).toHaveLength(2);
    expect(pageNumbers[0] + 1).toEqual(pageNumbers[1]);
  }
});

test('adds write-ins for contests that allow them', async () => {
  const writeInContest =
    electionMinimalExhaustiveSampleFixtures.election.contests.find(
      (contest) => contest.type === 'candidate' && contest.allowWriteIns
    )!;
  expect(writeInContest).toBeDefined();

  let seenWriteIn = false;

  for await (const cvr of generateCvrs({
    ballotPackage: await readBallotPackageFromBuffer(
      electionMinimalExhaustiveSampleFixtures.ballotPackage.asBuffer()
    ),
    scannerNames: ['scanner-1'],
    testMode: false,
  })) {
    if ((cvr[writeInContest.id] as string[]).includes('write-in-0')) {
      seenWriteIn = true;
      break;
    }
  }

  expect(seenWriteIn).toEqual(true);
});

test('adds write-ins for contests that have 1 seat', async () => {
  const writeInContest = electionFamousNames2021Fixtures.election.contests.find(
    (contest) =>
      contest.type === 'candidate' &&
      contest.allowWriteIns &&
      contest.seats === 1
  )!;
  expect(writeInContest).toBeDefined();

  let seenWriteIn = false;

  for await (const cvr of generateCvrs({
    ballotPackage: await readBallotPackageFromBuffer(
      electionFamousNames2021Fixtures.ballotPackage.asBuffer()
    ),
    scannerNames: ['scanner-1'],
    testMode: false,
  })) {
    if ((cvr[writeInContest.id] as string[]).includes('write-in-0')) {
      seenWriteIn = true;
      break;
    }
  }

  expect(seenWriteIn).toEqual(true);
});

test('can include ballot images for write-ins', async () => {
  const writeInContest =
    electionMinimalExhaustiveSampleFixtures.election.contests.find(
      (contest) => contest.type === 'candidate' && contest.allowWriteIns
    )!;
  expect(writeInContest).toBeDefined();

  for await (const cvr of generateCvrs({
    ballotPackage: await readBallotPackageFromBuffer(
      electionMinimalExhaustiveSampleFixtures.ballotPackage.asBuffer()
    ),
    scannerNames: ['scanner-1'],
    testMode: false,
    includeBallotImages: 'write-ins',
  })) {
    if (castVoteRecordHasWriteIns(cvr)) {
      expect(cvr['_ballotImages']).toBeDefined();
    } else {
      expect(cvr['_ballotImages']).toBeUndefined();
    }
  }
});

test('can include ballot images for all records', async () => {
  const writeInContest =
    electionMinimalExhaustiveSampleFixtures.election.contests.find(
      (contest) => contest.type === 'candidate' && contest.allowWriteIns
    )!;
  expect(writeInContest).toBeDefined();

  for await (const cvr of generateCvrs({
    ballotPackage: await readBallotPackageFromBuffer(
      electionMinimalExhaustiveSampleFixtures.ballotPackage.asBuffer()
    ),
    scannerNames: ['scanner-1'],
    testMode: false,
    includeBallotImages: 'always',
  })) {
    expect(cvr['_ballotImages']).toBeDefined();
  }
});
