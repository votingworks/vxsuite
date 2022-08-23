import { CandidateContest } from '@votingworks/types';
import { electionMinimalExhaustiveSample } from '.';
import { generateCvrs } from './generate_cvrs';
import { throwIllegalValue } from './utils';

test('has all ballot types', () => {
  let seenAbsentee = false;
  let seenProvisional = false;
  let seenStandard = false;

  for (const cvr of generateCvrs(
    electionMinimalExhaustiveSample,
    ['scanner-1'],
    false
  )) {
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

  expect(seenAbsentee).toBe(true);
  expect(seenProvisional).toBe(true);
  expect(seenStandard).toBe(true);
});

test('uses all the scanners given', () => {
  const scanners = new Set<string>();

  for (const cvr of generateCvrs(
    electionMinimalExhaustiveSample,
    ['scanner-1', 'scanner-2'],
    false
  )) {
    scanners.add(cvr._scannerId);
  }

  expect([...scanners].sort()).toStrictEqual(['scanner-1', 'scanner-2']);
});

test('adds write-ins for contests that allow them', () => {
  const writeInContest = electionMinimalExhaustiveSample.contests.find(
    (contest) => contest.type === 'candidate' && contest.allowWriteIns
  )!;
  expect(writeInContest).toBeDefined();

  let seenWriteIn = false;

  for (const cvr of generateCvrs(
    electionMinimalExhaustiveSample,
    ['scanner-1'],
    false
  )) {
    if ((cvr[writeInContest.id] as string[]).includes('write-in-0')) {
      seenWriteIn = true;
      break;
    }
  }

  expect(seenWriteIn).toBe(true);
});

test('adds write-ins even when there is only 1 seat', () => {
  const writeInContest = electionMinimalExhaustiveSample.contests.find(
    (contest): contest is CandidateContest =>
      contest.type === 'candidate' && contest.allowWriteIns
  )!;
  expect(writeInContest).toBeDefined();

  let seenWriteIn = false;

  for (const cvr of generateCvrs(
    {
      ...electionMinimalExhaustiveSample,
      contests: [
        ...electionMinimalExhaustiveSample.contests.filter(
          (contest) => contest.id !== writeInContest.id
        ),
        { ...writeInContest, seats: 1 },
      ],
    },
    ['scanner-1'],
    false
  )) {
    if ((cvr[writeInContest.id] as string[]).includes('write-in-0')) {
      seenWriteIn = true;
      break;
    }
  }

  expect(seenWriteIn).toBe(true);
});
