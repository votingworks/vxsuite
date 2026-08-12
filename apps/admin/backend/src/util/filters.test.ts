import { expect, test } from 'vitest';
import { readElectionGeneral } from '@votingworks/fixtures';
import { Admin, BallotStyleGroupId } from '@votingworks/types';
import { assertIsBackendFilter, convertFrontendFilter } from './filters.js';
import { ScannerBatch } from '../types.js';

const electionGeneral = readElectionGeneral();

function mockBatch(batchId: string, pollingPlaceId?: string): ScannerBatch {
  return {
    batchId,
    label: `Batch ${batchId}`,
    scannerId: 'scanner-1',
    electionId: 'election-1',
    pollingPlaceId,
    startedAt: '2024-01-01T00:00:00.000Z',
  };
}

// Center Springfield covers precinct 23, North Springfield covers precinct 21.
const scannerBatches: ScannerBatch[] = [
  mockBatch('batch-center-1', '23-polling-place'),
  mockBatch('batch-center-2', '23-polling-place'),
  mockBatch('batch-north-1', '21-polling-place'),
  mockBatch('batch-south-1', '20-polling-place'),
  mockBatch('batch-unattributed'),
];

test('convertFrontendFilter', () => {
  expect(
    convertFrontendFilter(
      {
        districtIds: ['district-1'],
      },
      electionGeneral,
      scannerBatches
    )
  ).toEqual({
    ballotStyleGroupIds: ['12', '5'] as BallotStyleGroupId[],
  });

  expect(
    convertFrontendFilter(
      {
        districtIds: ['district-2'],
      },
      electionGeneral,
      scannerBatches
    )
  ).toEqual({
    ballotStyleGroupIds: ['12'],
  });

  expect(
    convertFrontendFilter(
      {
        districtIds: ['district-1', 'district-2'],
      },
      electionGeneral,
      scannerBatches
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
      electionGeneral,
      scannerBatches
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
      electionGeneral,
      scannerBatches
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
      electionGeneral,
      scannerBatches
    )
  ).toEqual({
    ballotStyleGroupIds: [],
  });
});

test('convertFrontendFilter - polling place reduces to batches and precincts', () => {
  expect(
    convertFrontendFilter(
      { pollingPlaceIds: ['23-polling-place'] },
      electionGeneral,
      scannerBatches
    )
  ).toEqual({
    batchIds: ['batch-center-1', 'batch-center-2'],
    precinctIds: ['23'],
  });

  // multiple polling places union their batches and precincts
  expect(
    convertFrontendFilter(
      { pollingPlaceIds: ['23-polling-place', '21-polling-place'] },
      electionGeneral,
      scannerBatches
    )
  ).toEqual({
    batchIds: ['batch-center-1', 'batch-center-2', 'batch-north-1'],
    precinctIds: ['23', '21'],
  });

  // a polling place with no imported batches yet excludes all ballots
  expect(
    convertFrontendFilter(
      { pollingPlaceIds: ['23-polling-place'] },
      electionGeneral,
      [mockBatch('batch-north-1', '21-polling-place')]
    )
  ).toEqual({
    batchIds: [],
    precinctIds: ['23'],
  });
});

test('convertFrontendFilter - polling place intersects existing dimensions', () => {
  expect(
    convertFrontendFilter(
      {
        pollingPlaceIds: ['23-polling-place'],
        batchIds: ['batch-center-2', 'batch-north-1'],
      },
      electionGeneral,
      scannerBatches
    )
  ).toEqual({
    batchIds: ['batch-center-2'],
    precinctIds: ['23'],
  });

  expect(
    convertFrontendFilter(
      {
        pollingPlaceIds: ['23-polling-place'],
        precinctIds: ['23', '21'],
      },
      electionGeneral,
      scannerBatches
    )
  ).toEqual({
    batchIds: ['batch-center-1', 'batch-center-2'],
    precinctIds: ['23'],
  });

  // no intersection between the polling place and the selected precinct
  expect(
    convertFrontendFilter(
      {
        pollingPlaceIds: ['23-polling-place'],
        precinctIds: ['21'],
      },
      electionGeneral,
      scannerBatches
    )
  ).toEqual({
    batchIds: ['batch-center-1', 'batch-center-2'],
    precinctIds: [],
  });
});

test('convertFrontendFilter - polling place combines with other filters', () => {
  expect(
    convertFrontendFilter(
      {
        pollingPlaceIds: ['21-polling-place'],
        districtIds: ['district-2'],
        votingMethods: ['absentee'],
      },
      electionGeneral,
      scannerBatches
    )
  ).toEqual({
    ballotStyleGroupIds: ['12'],
    batchIds: ['batch-north-1'],
    precinctIds: ['21'],
    votingMethods: ['absentee'],
  });
});

test('assertIsBackendFilter', () => {
  const filter: Admin.FrontendReportingFilter = {
    districtIds: ['12'],
  };
  expect(() => {
    assertIsBackendFilter(filter);
  }).toThrowError();

  const pollingPlaceFilter: Admin.FrontendReportingFilter = {
    pollingPlaceIds: ['23-polling-place'],
  };
  expect(() => {
    assertIsBackendFilter(pollingPlaceFilter);
  }).toThrowError();

  expect(() => {
    assertIsBackendFilter({ precinctIds: ['precinct-1'] });
  }).not.toThrowError();
});
