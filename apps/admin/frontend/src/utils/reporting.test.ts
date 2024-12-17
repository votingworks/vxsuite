import {
  Admin,
  BallotStyleGroupId,
  Election,
  Tabulation,
} from '@votingworks/types';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import {
  canonicalizeFilter,
  canonicalizeGroupBy,
  generateBallotCountReportPdfFilename,
  generateTallyReportPdfFilename,
  isFilterEmpty,
} from './reporting';

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();

test('canonicalizeFilter', () => {
  expect(canonicalizeFilter({})).toEqual({});
  expect(
    canonicalizeFilter({
      precinctIds: [],
      ballotStyleGroupIds: [],
      batchIds: [],
      scannerIds: [],
      votingMethods: [],
      partyIds: [],
      adjudicationFlags: [],
      districtIds: [],
    })
  ).toEqual({});
  expect(
    canonicalizeFilter({
      precinctIds: ['b', 'a'],
      ballotStyleGroupIds: ['b', 'a'] as BallotStyleGroupId[],
      batchIds: ['b', 'a'],
      scannerIds: ['b', 'a'],
      votingMethods: ['precinct', 'absentee'],
      partyIds: ['b', 'a'],
      adjudicationFlags: ['isBlank', 'hasOvervote'],
      districtIds: ['district-2', 'district-1'],
    })
  ).toEqual({
    precinctIds: ['a', 'b'],
    ballotStyleGroupIds: ['a', 'b'] as BallotStyleGroupId[],
    batchIds: ['a', 'b'],
    scannerIds: ['a', 'b'],
    votingMethods: ['absentee', 'precinct'],
    partyIds: ['a', 'b'],
    adjudicationFlags: ['hasOvervote', 'isBlank'],
    districtIds: ['district-1', 'district-2'],
  });
});

test('canonicalizeGroupBy', () => {
  expect(canonicalizeGroupBy({})).toEqual({
    groupByScanner: false,
    groupByBatch: false,
    groupByBallotStyle: false,
    groupByPrecinct: false,
    groupByParty: false,
    groupByVotingMethod: false,
  });

  const allTrueGroupBy: Tabulation.GroupBy = {
    groupByScanner: true,
    groupByBatch: true,
    groupByBallotStyle: true,
    groupByPrecinct: true,
    groupByParty: true,
    groupByVotingMethod: true,
  };
  expect(canonicalizeGroupBy(allTrueGroupBy)).toEqual(allTrueGroupBy);
});

test('generateBallotCountReportPdfFilename', () => {
  const { election } = electionTwoPartyPrimaryDefinition;
  const testCases: Array<{
    filter?: Admin.FrontendReportingFilter;
    groupBy?: Tabulation.GroupBy;
    expectedFilename: string;
    isTestMode?: boolean;
    isOfficialResults?: boolean;
  }> = [
    {
      expectedFilename:
        'unofficial-full-election-ballot-count-report__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        adjudicationFlags: ['isBlank'],
      },
      isTestMode: true,
      expectedFilename:
        'TEST-unofficial-blank-ballot-count-report__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        adjudicationFlags: ['hasOvervote'],
      },
      isTestMode: true,
      expectedFilename:
        'TEST-unofficial-overvoted-ballot-count-report__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        adjudicationFlags: ['hasUndervote'],
      },
      isTestMode: true,
      expectedFilename:
        'TEST-unofficial-undervoted-ballot-count-report__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        adjudicationFlags: ['hasWriteIn'],
      },
      isTestMode: true,
      expectedFilename:
        'TEST-unofficial-write-in-ballot-count-report__2023-12-09_15-59-32.pdf',
    },
  ];

  for (const testCase of testCases) {
    expect(
      generateBallotCountReportPdfFilename({
        election,
        filter: testCase.filter ?? {},
        groupBy: testCase.groupBy ?? {},
        isTestMode: testCase.isTestMode ?? false,
        isOfficialResults: testCase.isOfficialResults ?? false,
        time: new Date(2023, 11, 9, 15, 59, 32),
      })
    ).toEqual(testCase.expectedFilename);
  }
});

test('generateTallyReportPdfFilename', () => {
  const { election } = electionTwoPartyPrimaryDefinition;
  const testCases: Array<{
    filter?: Admin.FrontendReportingFilter;
    groupBy?: Tabulation.GroupBy;
    expectedFilename: string;
    isTestMode?: boolean;
    isOfficialResults?: boolean;
  }> = [
    {
      expectedFilename:
        'unofficial-full-election-tally-report__2023-12-09_15-59-32.pdf',
    },
    {
      isOfficialResults: true,
      expectedFilename:
        'official-full-election-tally-report__2023-12-09_15-59-32.pdf',
    },
    {
      groupBy: { groupByBallotStyle: true },
      expectedFilename:
        'unofficial-tally-reports-by-ballot-style__2023-12-09_15-59-32.pdf',
    },
    {
      groupBy: { groupByPrecinct: true },
      expectedFilename:
        'unofficial-tally-reports-by-precinct__2023-12-09_15-59-32.pdf',
    },
    {
      groupBy: { groupByVotingMethod: true },
      expectedFilename:
        'unofficial-tally-reports-by-voting-method__2023-12-09_15-59-32.pdf',
    },
    {
      groupBy: { groupByBatch: true },
      expectedFilename:
        'unofficial-tally-reports-by-batch__2023-12-09_15-59-32.pdf',
    },
    {
      groupBy: { groupByScanner: true },
      expectedFilename:
        'unofficial-tally-reports-by-scanner__2023-12-09_15-59-32.pdf',
    },
    {
      groupBy: { groupByPrecinct: true, groupByVotingMethod: true },
      expectedFilename:
        'unofficial-tally-reports-by-precinct-and-voting-method__2023-12-09_15-59-32.pdf',
    },
    {
      filter: { precinctIds: ['precinct-1', 'precinct-2'] },
      expectedFilename:
        'unofficial-custom-tally-report__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        precinctIds: ['precinct-1'],
        ballotStyleGroupIds: ['1M'] as BallotStyleGroupId[],
        votingMethods: ['absentee'],
      },
      expectedFilename:
        'unofficial-custom-tally-report__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        precinctIds: ['precinct-1'],
      },
      expectedFilename:
        'unofficial-precinct-1-tally-report__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        ballotStyleGroupIds: ['1M'] as BallotStyleGroupId[],
      },
      expectedFilename:
        'unofficial-ballot-style-1M-tally-report__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        votingMethods: ['absentee'],
      },
      expectedFilename:
        'unofficial-absentee-ballots-tally-report__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        scannerIds: ['VX-00-000'],
      },
      expectedFilename:
        'unofficial-scanner-VX-00-000-tally-report__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        batchIds: ['12345678-0000-0000-0000-000000000000'],
      },
      expectedFilename:
        'unofficial-batch-12345678-tally-report__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        ballotStyleGroupIds: ['1M'] as BallotStyleGroupId[],
        votingMethods: ['absentee'],
      },
      expectedFilename:
        'unofficial-ballot-style-1M-absentee-ballots-tally-report__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        votingMethods: ['absentee'],
      },
      groupBy: { groupByPrecinct: true },
      expectedFilename:
        'unofficial-absentee-ballots-tally-reports-by-precinct__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        votingMethods: ['absentee'],
      },
      isTestMode: true,
      expectedFilename:
        'TEST-unofficial-absentee-ballots-tally-report__2023-12-09_15-59-32.pdf',
    },
    {
      filter: {
        districtIds: ['district-1'],
        votingMethods: ['absentee'],
      },
      isTestMode: true,
      expectedFilename:
        'TEST-unofficial-district-1-absentee-ballots-tally-report__2023-12-09_15-59-32.pdf',
    },
  ];

  for (const testCase of testCases) {
    expect(
      generateTallyReportPdfFilename({
        election,
        filter: testCase.filter ?? {},
        groupBy: testCase.groupBy ?? {},
        isTestMode: testCase.isTestMode ?? false,
        isOfficialResults: testCase.isOfficialResults ?? false,
        time: new Date(2023, 11, 9, 15, 59, 32),
      })
    ).toEqual(testCase.expectedFilename);
  }
});

test('generateReportPdfFilename when too long', () => {
  const { election: originalElection } = electionTwoPartyPrimaryDefinition;
  const election: Election = {
    ...originalElection,
    precincts: [
      {
        id: 'precinct-1',
        name: 'A'.repeat(256),
      },
      {
        id: 'precinct-2',
        name: 'Precinct 2',
      },
    ],
  };
  expect(
    generateTallyReportPdfFilename({
      election,
      filter: { precinctIds: ['precinct-1'] },
      groupBy: {},
      isTestMode: false,
      isOfficialResults: false,
      time: new Date(2022, 4, 11, 15, 2, 3),
    })
  ).toEqual('unofficial-custom-tally-report__2022-05-11_15-02-03.pdf');
});

test('isFilterEmpty', () => {
  expect(isFilterEmpty({})).toEqual(true);
  expect(isFilterEmpty({ batchIds: [] })).toEqual(false);
  expect(isFilterEmpty({ adjudicationFlags: [] })).toEqual(false);
  expect(isFilterEmpty({ districtIds: [] })).toEqual(false);
});
