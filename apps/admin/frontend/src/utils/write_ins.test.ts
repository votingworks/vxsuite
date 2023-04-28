import { electionSample } from '@votingworks/fixtures';
import {
  CandidateId,
  ContestId,
  Dictionary,
  ManualTally,
  writeInCandidate,
} from '@votingworks/types';
import { buildManualTally } from '../../test/helpers/build_manual_tally';
import {
  combineWriteInCounts,
  CountsByContestAndCandidateName,
  getAdjudicatedWriteInCandidate,
  getManualWriteInCounts,
  mergeWriteIns,
} from './write_ins';

// Converts the nested maps of write-in counts to an object for easier assertions
function writeInCountsAsObject(
  counts: CountsByContestAndCandidateName
): Dictionary<Dictionary<number>> {
  const countsObject: Dictionary<Dictionary<number>> = {};
  for (const [key, value] of counts) {
    countsObject[key] = Object.fromEntries(value);
  }
  return countsObject;
}

// Modifies a contest of external tally to include an additional write-in
// returns new write-in candidate id
function addWriteInToManualTally(
  manualTally: ManualTally,
  contestId: ContestId,
  name: string,
  tally: number
): CandidateId {
  const contestTally = manualTally.contestTallies[contestId];
  const candidate = getAdjudicatedWriteInCandidate(name, false);
  contestTally!.tallies[candidate.id] = {
    option: candidate,
    tally,
  };
  return candidate.id;
}

test('getManualWriteInCounts', () => {
  const manualTally = buildManualTally(electionSample, 1, [
    'county-commissioners',
    'city-mayor',
    'president',
  ]);
  addWriteInToManualTally(manualTally, 'county-commissioners', 'John', 4);
  addWriteInToManualTally(manualTally, 'county-commissioners', 'Jane', 7);
  addWriteInToManualTally(manualTally, 'city-mayor', 'Jill', 8);

  expect(
    writeInCountsAsObject(getManualWriteInCounts(manualTally))
  ).toMatchObject({
    'county-commissioners': {
      John: 4,
      Jane: 7,
    },
    'city-mayor': {
      Jill: 8,
    },
  });
});

test('combineWriteInCounts', () => {
  const writeInCount1 = new Map([
    [
      'president',
      new Map([
        ['John', 5],
        ['Jane', 3],
        ['Jill', 4],
      ]),
    ],
    [
      'governor',
      new Map([
        ['Hal', 3],
        ['Hoda', 4],
      ]),
    ],
  ]);
  const writeInCount2 = new Map([
    [
      'president',
      new Map([
        ['John', 7],
        ['Jane', 1],
        ['Jack', 2],
      ]),
    ],
    ['mayor', new Map([['Manny', 7]])],
  ]);

  const combinedCount = combineWriteInCounts([writeInCount1, writeInCount2]);
  expect(writeInCountsAsObject(combinedCount)).toMatchObject({
    president: {
      John: 12,
      Jane: 4,
      Jill: 4,
      Jack: 2,
    },
    governor: {
      Hal: 3,
      Hoda: 4,
    },
    mayor: {
      Manny: 7,
    },
  });
});

test('mergeWriteIns', () => {
  const manualTally = buildManualTally(electionSample, 0, [
    'county-commissioners',
  ]);
  const originalWriteInIds = [];
  originalWriteInIds.push(
    addWriteInToManualTally(manualTally, 'county-commissioners', 'Bri', 10)
  );
  originalWriteInIds.push(
    addWriteInToManualTally(manualTally, 'county-commissioners', 'Brad', 9)
  );
  originalWriteInIds.push(
    addWriteInToManualTally(manualTally, 'county-commissioners', 'Bran', 8)
  );

  const manualTallyWithWriteInsMerged = mergeWriteIns(manualTally);

  // Should have the merged results
  expect(
    manualTallyWithWriteInsMerged.contestTallies['county-commissioners']
  ).toMatchObject({
    tallies: {
      'write-in': {
        option: writeInCandidate,
        tally: 27,
      },
    },
  });

  // Should not have the original write-ins
  const countyCommissionerCandidateIds = Object.keys(
    manualTallyWithWriteInsMerged.contestTallies['county-commissioners']!
      .tallies
  );
  for (const originalWriteInId of originalWriteInIds) {
    expect(countyCommissionerCandidateIds).not.toContain(originalWriteInId);
  }
});
