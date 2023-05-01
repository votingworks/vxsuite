import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import {
  BallotPackage,
  CVR,
  getBallotStyle,
  getContests,
} from '@votingworks/types';
import { assert, find, throwIllegalValue } from '@votingworks/basics';
import { generateCvrs } from './generate_cvrs';
import { IMAGE_URI_REGEX } from './utils';

function mockBallotPackage(): BallotPackage {
  return electionGridLayoutNewHampshireAmherstFixtures.electionJson.toBallotPackage();
}

test('produces well-formed cast vote records with all contests', async () => {
  const { election } = electionGridLayoutNewHampshireAmherstFixtures;
  for await (const cvr of generateCvrs({
    ballotPackage: mockBallotPackage(),
    scannerIds: ['scanner-1'],
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
            ballotStyleId,
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
    scannerIds: ['scanner-1'],
    includeBallotImages: false,
    ballotPackage: mockBallotPackage(),
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
    scannerIds: ['scanner-1', 'scanner-2'],
    includeBallotImages: false,
    ballotPackage: mockBallotPackage(),
  })) {
    expect(cvr.CreatingDeviceId).toBeDefined();
    assert(typeof cvr.CreatingDeviceId !== 'undefined');
    scanners.add(cvr.CreatingDeviceId);
  }

  expect([...scanners].sort()).toStrictEqual(['scanner-1', 'scanner-2']);
});

test('adds write-ins for contests that allow them', async () => {
  const writeInContest =
    electionGridLayoutNewHampshireAmherstFixtures.election.contests.find(
      (contest) => contest.type === 'candidate' && contest.allowWriteIns
    )!;
  let seenWriteIn = false;

  for await (const cvr of generateCvrs({
    testMode: false,
    scannerIds: ['scanner-1'],
    includeBallotImages: false,
    ballotPackage: mockBallotPackage(),
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
  const writeInContest =
    electionGridLayoutNewHampshireAmherstFixtures.election.contests.find(
      (contest) =>
        contest.type === 'candidate' &&
        contest.allowWriteIns &&
        contest.seats === 1
    )!;
  let seenWriteIn = false;

  for await (const cvr of generateCvrs({
    scannerIds: ['scanner-1'],
    testMode: false,
    includeBallotImages: false,
    ballotPackage:
      electionGridLayoutNewHampshireAmherstFixtures.electionJson.toBallotPackage(),
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

test('can include ballot image references for write-ins', async () => {
  let reportHasWriteIn = false;
  for await (const cvr of generateCvrs({
    testMode: false,
    scannerIds: ['scanner-1'],
    includeBallotImages: true,
    ballotPackage: mockBallotPackage(),
  })) {
    let cvrHasWriteIn = false;
    const selectionPositions = cvr.CVRSnapshot[0]!.CVRContest.flatMap(
      (cvrContest) => cvrContest.CVRContestSelection
    ).flatMap((cvrContestSelection) => cvrContestSelection.SelectionPosition);

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
      const firstImageDataLocation = cvr.BallotImage?.[0]?.Location;
      const secondImageDataLocation = cvr.BallotImage?.[1]?.Location;
      expect(firstImageDataLocation ?? secondImageDataLocation).toBeDefined();
    } else {
      expect(cvr.BallotImage).toBeUndefined();
    }
  }

  expect(reportHasWriteIn).toBeTruthy();
});
