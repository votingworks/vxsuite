import { readElectionGeneral } from '@votingworks/fixtures';
import { Admin, BallotStyleGroupId } from '@votingworks/types';
import { assertIsBackendFilter, convertFrontendFilter } from './filters';

const electionGeneral = readElectionGeneral();

test('convertFrontendFilter', () => {
  expect(
    convertFrontendFilter(
      {
        districtIds: ['district-1'],
      },
      electionGeneral
    )
  ).toEqual({
    ballotStyleGroupIds: ['12', '5'] as BallotStyleGroupId[],
  });

  expect(
    convertFrontendFilter(
      {
        districtIds: ['district-2'],
      },
      electionGeneral
    )
  ).toEqual({
    ballotStyleGroupIds: ['12'],
  });

  expect(
    convertFrontendFilter(
      {
        districtIds: ['district-1', 'district-2'],
      },
      electionGeneral
    )
  ).toEqual({
    ballotStyleGroupIds: ['12', '5'] as BallotStyleGroupId[],
  });

  expect(
    convertFrontendFilter(
      {
        votingMethods: ['absentee'],
        ballotStyleGroupIds: ['12'] as BallotStyleGroupId[],
      },
      electionGeneral
    )
  ).toEqual({
    votingMethods: ['absentee'],
    ballotStyleGroupIds: ['12'],
  });

  expect(
    convertFrontendFilter(
      {
        districtIds: ['district-2'],
        ballotStyleGroupIds: ['12'] as BallotStyleGroupId[],
      },
      electionGeneral
    )
  ).toEqual({
    ballotStyleGroupIds: ['12'],
  });

  // should exclude all ballots, because there is no intersection between district and ballot styles
  expect(
    convertFrontendFilter(
      {
        districtIds: ['district-2'],
        ballotStyleGroupIds: ['5'] as BallotStyleGroupId[],
      },
      electionGeneral
    )
  ).toEqual({
    ballotStyleGroupIds: [],
  });
});

test('assertIsBackendFilter', () => {
  const filter: Admin.FrontendReportingFilter = {
    districtIds: ['12'],
  };
  expect(() => {
    assertIsBackendFilter(filter);
  }).toThrowError();

  expect(() => {
    assertIsBackendFilter({ precinctIds: ['precinct-1'] });
  }).not.toThrowError();
});
