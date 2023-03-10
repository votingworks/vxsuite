import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleDefinition,
  electionMinimalExhaustiveSampleFixtures,
} from '@votingworks/fixtures';
import { CVR, getBallotStyle, getContests } from '@votingworks/types';
import { BallotPackage, readBallotPackageFromBuffer } from '@votingworks/utils';
import { assert, find, take, throwIllegalValue } from '@votingworks/basics';
import { generateCvrs } from './generate_cvrs';
import { IMAGE_URI_REGEX } from './utils';

async function mockBallotPackage(): Promise<BallotPackage> {
  return await readBallotPackageFromBuffer(
    electionMinimalExhaustiveSampleFixtures.ballotPackage.asBuffer()
  );
}

async function mockMultiSheetBallotPackage(): Promise<BallotPackage> {
  const singleSheetBallotPackage = await mockBallotPackage();

  return {
    ...singleSheetBallotPackage,
    ballots: singleSheetBallotPackage.ballots.map((ballot) => ({
      ...ballot,
      layout: [...ballot.layout, ...ballot.layout],
    })),
  };
}

test('fails on ballot package with more than one sheet', async () => {
  await expect(async () =>
    take(
      Infinity,
      generateCvrs({
        ballotPackage: await mockMultiSheetBallotPackage(),
        scannerNames: ['scanner-1'],
        testMode: true,
        includeBallotImages: false,
      })
    )
  ).rejects.toThrowError('only single-sheet ballots are supported');
});

test('produces well-formed cast vote records with all contests', async () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;
  for await (const cvr of generateCvrs({
    ballotPackage: await mockBallotPackage(),
    scannerNames: ['scanner-1'],
    testMode: true,
    includeBallotImages: false,
  })) {
    expect(cvr.CVRSnapshot).toHaveLength(1);
    expect(cvr.BallotSheetId).toEqual('1');
    const ballotStyleId = cvr.BallotStyleId;
    expect(
      cvr.CVRSnapshot[0]!.CVRContest?.map((cvrContest) => cvrContest.ContestId)
    ).toMatchObject(
      expect.arrayContaining(
        getContests({
          ballotStyle: getBallotStyle({
            ballotStyleId: ballotStyleId!,
            election,
          })!,
          election,
        }).map((contest) => contest.id)
      )
    );
  }
});

test('has absentee and standard ballot types', async () => {
  let seenAbsentee = false;
  let seenStandard = false;

  for await (const cvr of generateCvrs({
    testMode: false,
    scannerNames: ['scanner-1'],
    includeBallotImages: false,
    ballotPackage: await mockBallotPackage(),
  })) {
    switch (cvr.vxBallotType) {
      case CVR.vxBallotType.Absentee:
        seenAbsentee = true;
        break;

      case CVR.vxBallotType.Precinct:
        seenStandard = true;
        break;

      case undefined:
      case CVR.vxBallotType.Provisional:
        break;

      default:
        throwIllegalValue(cvr.vxBallotType);
    }

    if (seenAbsentee && seenStandard) {
      break;
    }
  }

  expect(seenAbsentee).toEqual(true);
  expect(seenStandard).toEqual(true);
});

test('uses all the scanners given', async () => {
  const scanners = new Set<string>();

  for await (const cvr of generateCvrs({
    testMode: false,
    scannerNames: ['scanner-1', 'scanner-2'],
    includeBallotImages: false,
    ballotPackage: await mockBallotPackage(),
  })) {
    expect(cvr.CreatingDeviceId).toBeDefined();
    assert(typeof cvr.CreatingDeviceId !== 'undefined');
    scanners.add(cvr.CreatingDeviceId);
  }

  expect([...scanners].sort()).toStrictEqual(['scanner-1', 'scanner-2']);
});

test('adds write-ins for contests that allow them', async () => {
  const writeInContest =
    electionMinimalExhaustiveSampleFixtures.election.contests.find(
      (contest) => contest.type === 'candidate' && contest.allowWriteIns
    )!;
  let seenWriteIn = false;

  for await (const cvr of generateCvrs({
    testMode: false,
    scannerNames: ['scanner-1'],
    includeBallotImages: false,
    ballotPackage: await mockBallotPackage(),
  })) {
    const cvrContests = cvr.CVRSnapshot[0]?.CVRContest;
    assert(cvrContests);
    const cvrContest = find(
      cvrContests,
      (contest) => contest.ContestId === writeInContest.id
    );

    if (
      cvrContest.CVRContestSelection?.some((selection) =>
        selection.ContestSelectionId?.startsWith('write-in-')
      )
    ) {
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
  let seenWriteIn = false;

  for await (const cvr of generateCvrs({
    scannerNames: ['scanner-1'],
    testMode: false,
    includeBallotImages: false,
    ballotPackage: await readBallotPackageFromBuffer(
      electionFamousNames2021Fixtures.ballotPackage.asBuffer()
    ),
  })) {
    const cvrContests = cvr.CVRSnapshot[0]?.CVRContest;
    assert(cvrContests);
    const cvrContest = find(
      cvrContests,
      (contest) => contest.ContestId === writeInContest.id
    );

    if (
      cvrContest.CVRContestSelection?.some((selection) =>
        selection.ContestSelectionId?.startsWith('write-in-')
      )
    ) {
      seenWriteIn = true;
      break;
    }
  }

  expect(seenWriteIn).toEqual(true);
});

// current fixture only has write-ins on the front
test('can include ballot image references for write-ins', async () => {
  let reportHasWriteIn = false;
  for await (const cvr of generateCvrs({
    testMode: false,
    scannerNames: ['scanner-1'],
    includeBallotImages: true,
    ballotPackage: await mockBallotPackage(),
  })) {
    let cvrHasWriteIn = false;
    const selectionPositions = cvr.CVRSnapshot[0]!.CVRContest!.flatMap(
      (cvrContest) => cvrContest.CVRContestSelection!
    )?.flatMap((cvrContestSelection) => cvrContestSelection.SelectionPosition);

    for (const selectionPosition of selectionPositions) {
      if (selectionPosition.CVRWriteIn) {
        reportHasWriteIn = true;
        cvrHasWriteIn = true;

        expect(selectionPosition.CVRWriteIn).toMatchObject({
          '@type': 'CVR.CVRWriteIn',
          WriteInImage: {
            Location: expect.stringMatching(IMAGE_URI_REGEX),
          },
        });
      }
    }

    if (cvrHasWriteIn) {
      expect(cvr.BallotImage).toMatchObject([
        {
          '@type': 'CVR.ImageData',
          Location: expect.stringMatching(IMAGE_URI_REGEX),
        },
        {
          '@type': 'CVR.ImageData',
        },
      ]);
    } else {
      expect(cvr.BallotImage).toBeUndefined();
    }
  }

  expect(reportHasWriteIn).toBeTruthy();
});
