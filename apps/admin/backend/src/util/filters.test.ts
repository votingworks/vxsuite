import { electionGeneral } from '@votingworks/fixtures';
import { Admin } from '@votingworks/types';
import { assertIsBackendFilter, convertFrontendFilter } from './filters';

test('convertFrontendFilter', () => {
  expect(
    convertFrontendFilter(
      {
        districtIds: ['district-1'],
      },
      electionGeneral
    )
  ).toEqual({
    ballotStyleIds: ['12', '5'],
  });

  expect(
    convertFrontendFilter(
      {
        districtIds: ['district-2'],
      },
      electionGeneral
    )
  ).toEqual({
    ballotStyleIds: ['12'],
  });

  expect(
    convertFrontendFilter(
      {
        districtIds: ['district-1', 'district-2'],
      },
      electionGeneral
    )
  ).toEqual({
    ballotStyleIds: ['12', '5'],
  });

  expect(
    convertFrontendFilter(
      {
        votingMethods: ['absentee'],
        ballotStyleGroupIds: ['12'],
      },
      electionGeneral
    )
  ).toEqual({
    votingMethods: ['absentee'],
    ballotStyleIds: ['12'],
  });

  expect(
    convertFrontendFilter(
      {
        districtIds: ['district-2'],
        ballotStyleGroupIds: ['12'],
      },
      electionGeneral
    )
  ).toEqual({
    ballotStyleIds: ['12'],
  });

  // should exclude all ballots, because there is no intersection between district and ballot styles
  expect(
    convertFrontendFilter(
      {
        districtIds: ['district-2'],
        ballotStyleGroupIds: ['5'],
      },
      electionGeneral
    )
  ).toEqual({
    ballotStyleIds: [],
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
