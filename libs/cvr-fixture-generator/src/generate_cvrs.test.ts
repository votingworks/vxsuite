import { assert, find, throwIllegalValue } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleDefinition,
  electionMinimalExhaustiveSampleFixtures,
} from '@votingworks/fixtures';
import { CVR, getBallotStyle, getContests } from '@votingworks/types';
import { BallotPackage, readBallotPackageFromBuffer } from '@votingworks/utils';
import { generateCvrs } from './generate_cvrs';

async function mockBallotPackage(): Promise<BallotPackage> {
  return await readBallotPackageFromBuffer(
    electionMinimalExhaustiveSampleFixtures.ballotPackage.asBuffer()
  );
}

test('produces well-formed cast vote records with all contests', async () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;
  for await (const cvr of generateCvrs({
    ballotPackage: await mockBallotPackage(),
    scannerNames: ['scanner-1'],
  })) {
    expect(cvr.CVRSnapshot).toHaveLength(1);
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
    scannerNames: ['scanner-1'],
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
    scannerNames: ['scanner-1', 'scanner-2'],
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
    scannerNames: ['scanner-1'],
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
