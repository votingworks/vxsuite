import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { Election } from '@votingworks/types';
import {
  generateElectionBasedSubfolderName,
  generateFilenameForElectionPackage,
  generateLogFilename,
  LogFileType,
  generateCastVoteRecordExportDirectoryName,
  CastVoteRecordExportDirectoryNameComponents,
  parseCastVoteRecordReportExportDirectoryName,
  generateReadinessReportFilename,
} from './filenames';

const electionGeneralDefinition = readElectionGeneralDefinition();

describe('generateElectionBasedSubfolderName', () => {
  test('generates basic election subfolder name as expected', () => {
    const mockElection: Election = {
      ...electionGeneralDefinition.election,
      county: { name: 'King County', id: '' },
      title: 'General Election',
    };
    expect(
      generateElectionBasedSubfolderName(mockElection, 'testHash12')
    ).toEqual('king-county_general-election_testHash12');
  });

  test('generates election subfolder name as expected when election county and title have weird characters', () => {
    const mockElection: Election = {
      ...electionGeneralDefinition.election,
      county: { name: '-K(ing&COUN-----TY**', id: '' },
      title: 'General-Election@@',
    };
    expect(
      generateElectionBasedSubfolderName(mockElection, 'testHash12')
    ).toEqual('k-ing-coun-ty_general-election_testHash12');
  });

  test('generates election subfolder name as expected when ballot hash length varies', () => {
    const mockElection: Election = {
      ...electionGeneralDefinition.election,
      county: { name: 'King County', id: '' },
      title: 'General Election',
    };
    expect(
      generateElectionBasedSubfolderName(
        mockElection,
        'testHash12thisisextratext'
      )
    ).toEqual('king-county_general-election_testHash12');

    expect(generateElectionBasedSubfolderName(mockElection, '')).toEqual(
      'king-county_general-election_'
    );

    expect(generateElectionBasedSubfolderName(mockElection, 'short')).toEqual(
      'king-county_general-election_short'
    );
  });
});

test('generates ballot export package name with zero padded time pieces', () => {
  const time = new Date(2019, 2, 1, 1, 9, 2);
  expect(generateFilenameForElectionPackage(time)).toEqual(
    'election-package__2019-03-01_01-09-02.zip'
  );
});

function arbitraryTimestampDate(): fc.Arbitrary<Date> {
  return (
    fc
      // keep 4-digit year
      .date({ min: new Date(0), max: new Date(9999, 0, 1) })
      .map((date) => {
        // stringified date only has 1s precision
        date.setMilliseconds(0);
        return date;
      })
  );
}

function arbitrarySafeName(): fc.Arbitrary<string> {
  return fc
    .stringOf(
      fc.constantFrom(
        ...' abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      ),
      { minLength: 1 }
    )
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter((s) => s.length >= 1);
}

test('generateLogFilename', () => {
  fc.assert(
    fc.property(
      arbitrarySafeName(),
      fc.oneof(fc.constant(undefined), arbitraryTimestampDate()),
      (logName, time) => {
        const name = generateLogFilename(logName, LogFileType.Raw, time);
        expect(name).toMatch(/^.*_\d\d\d\d-\d\d-\d\d_\d\d-\d\d-\d\d.log$/);
        expect(name).toContain(logName);
        const cdfName = generateLogFilename(logName, LogFileType.Cdf, time);
        expect(cdfName).toMatch(/^.*_\d\d\d\d-\d\d-\d\d_\d\d-\d\d-\d\d.json$/);
        expect(cdfName).toContain(logName);
      }
    )
  );
});

test.each<{
  input: CastVoteRecordExportDirectoryNameComponents;
  expectedDirectoryName: string;
}>([
  {
    input: {
      inTestMode: true,
      machineId: 'SCAN-0001',
      time: new Date(2023, 7, 16, 17, 2, 24),
    },
    expectedDirectoryName: 'TEST__machine_SCAN-0001__2023-08-16_17-02-24',
  },
  {
    input: {
      inTestMode: false,
      machineId: 'SCAN-0001',
      time: new Date(2023, 7, 16, 17, 2, 24),
    },
    expectedDirectoryName: 'machine_SCAN-0001__2023-08-16_17-02-24',
  },
  {
    input: {
      inTestMode: true,
      machineId: '<3-u!n#icorn<3',
      time: new Date(2023, 7, 16, 17, 2, 24),
    },
    expectedDirectoryName: 'TEST__machine_3unicorn3__2023-08-16_17-02-24',
  },
])(
  'generateCastVoteRecordExportDirectoryName',
  ({ input, expectedDirectoryName }) => {
    expect(generateCastVoteRecordExportDirectoryName(input)).toEqual(
      expectedDirectoryName
    );
  }
);

test.each<{
  directoryName: string;
  expectedDirectoryNameComponents?: CastVoteRecordExportDirectoryNameComponents;
}>([
  {
    directoryName: 'TEST__machine_SCAN-0001__2023-08-16_17-02-24',
    expectedDirectoryNameComponents: {
      inTestMode: true,
      machineId: 'SCAN-0001',
      time: new Date(2023, 7, 16, 17, 2, 24),
    },
  },
  {
    directoryName: 'machine_SCAN-0001__2023-08-16_17-02-24',
    expectedDirectoryNameComponents: {
      inTestMode: false,
      machineId: 'SCAN-0001',
      time: new Date(2023, 7, 16, 17, 2, 24),
    },
  },
  {
    directoryName:
      'TEST__machine_SCAN-0001__2023-08-16_17-02-24__extra-section',
    expectedDirectoryNameComponents: undefined,
  },
  {
    directoryName: 'machine_SCAN-0001__2023-08-16_17-02-24__extra-section',
    expectedDirectoryNameComponents: undefined,
  },
  {
    directoryName: 'TEST__machine_SCAN-0001', // Missing time section
    expectedDirectoryNameComponents: undefined,
  },
  {
    directoryName: 'machine_SCAN-0001', // Missing time section
    expectedDirectoryNameComponents: undefined,
  },
  {
    directoryName: 'TEST__SCAN-0001__2023-08-16_17-02-24', // Missing machine_ prefix
    expectedDirectoryNameComponents: undefined,
  },
  {
    directoryName: 'SCAN-0001__2023-08-16_17-02-24', // Missing machine_ prefix
    expectedDirectoryNameComponents: undefined,
  },
  {
    directoryName: 'TEST__wrong-prefix_SCAN-0001__2023-08-16_17-02-24',
    expectedDirectoryNameComponents: undefined,
  },
  {
    directoryName: 'wrong-prefix_SCAN-0001__2023-08-16_17-02-24',
    expectedDirectoryNameComponents: undefined,
  },
  {
    directoryName: 'TEST__machine_SCAN-0001__invalid-time',
    expectedDirectoryNameComponents: undefined,
  },
  {
    directoryName: 'machine_SCAN-0001__invalid-time',
    expectedDirectoryNameComponents: undefined,
  },
])(
  'parseCastVoteRecordReportExportDirectoryName',
  ({ directoryName, expectedDirectoryNameComponents }) => {
    expect(parseCastVoteRecordReportExportDirectoryName(directoryName)).toEqual(
      expectedDirectoryNameComponents
    );
  }
);

test('generateReadinessReportFilename', () => {
  const machineId = 'SCAN-0001';
  const generatedAtTime = new Date(2023, 7, 16, 17, 2, 24);
  const expectedFilename =
    'readiness-report__SCAN-0001__2023-08-16_17-02-24.pdf';

  const result = generateReadinessReportFilename({
    machineId,
    generatedAtTime,
  });

  expect(result).toEqual(expectedFilename);
});
