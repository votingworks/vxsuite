import fc from 'fast-check';
import {
  electionGeneralDefinition,
  electionWithMsEitherNeitherDefinition,
} from '@votingworks/fixtures';
import { Election, ElectionDefinition } from '@votingworks/types';
import { typedAs } from '@votingworks/basics';
import {
  parseBallotExportPackageInfoFromFilename,
  generateElectionBasedSubfolderName,
  generateFilenameForBallotExportPackage,
  generateFinalExportDefaultFilename,
  ElectionData,
  generateFilenameForBallotExportPackageFromElectionData,
  generateBatchResultsDefaultFilename,
  generateLogFilename,
  LogFileType,
  generateSemsFinalExportDefaultFilename,
  CastVoteRecordReportListing,
  generateCastVoteRecordReportDirectoryName,
  parseCastVoteRecordReportDirectoryName,
  generateCastVoteRecordExportDirectoryName,
} from './filenames';

describe('parseBallotExportPackageInfoFromFilename', () => {
  test('parses a basic name properly', () => {
    const name =
      'choctaw-county_2020-general-election_a5753d5776__2020-12-02_09-42-50.zip';

    const parsedInfo = parseBallotExportPackageInfoFromFilename(name);
    expect(parsedInfo).toBeTruthy();
    const { electionCounty, electionName, electionHash, timestamp } =
      parsedInfo!;
    expect(electionCounty).toEqual('choctaw county');
    expect(electionName).toEqual('2020 general election');
    expect(electionHash).toEqual('a5753d5776');
    expect(timestamp).toStrictEqual(new Date(2020, 11, 2, 9, 42, 50));
  });

  test('fails to parse a name with the section separator twice', () => {
    const name =
      'choctaw-county_2020-general-election__a5753d5776__2020-12-02_09-42-50.zip';

    expect(parseBallotExportPackageInfoFromFilename(name)).toBeUndefined();
  });

  test('fails to parse a name with a bad election string', () => {
    const name =
      'choctaw-county_2020-general_election_a5753d5776__2020-12-02_09-42-50.zip';

    expect(parseBallotExportPackageInfoFromFilename(name)).toBeUndefined();
  });

  test('fails to parse a name with no section separator', () => {
    expect(parseBallotExportPackageInfoFromFilename('string')).toBeUndefined();
  });

  test('fails to parse a name without all election segments', () => {
    const name = 'string__2020-12-02_09-42-50.zip';
    expect(parseBallotExportPackageInfoFromFilename(name)).toBeUndefined();
  });

  test('uses placeholders for parts that get sanitized away', () => {
    const timestamp = new Date(2020, 3, 14);
    expect(
      generateFilenameForBallotExportPackageFromElectionData({
        electionCounty: '!!!', // sanitized as empty string
        electionHash: 'abcdefg',
        electionName: '???', // sanitized as empty string
        timestamp,
      })
    ).toEqual('county_election_abcdefg__2020-04-14_00-00-00.zip');
  });

  test('works end to end when generating ballot package name', () => {
    const time = new Date(2020, 3, 14);
    expect(
      parseBallotExportPackageInfoFromFilename(
        generateFilenameForBallotExportPackage(electionGeneralDefinition, time)
      )
    ).toEqual({
      electionCounty:
        electionGeneralDefinition.election.county.name.toLocaleLowerCase(),
      electionName:
        electionGeneralDefinition.election.title.toLocaleLowerCase(),
      electionHash: electionGeneralDefinition.electionHash.slice(0, 10),
      timestamp: time,
    });
    expect(
      parseBallotExportPackageInfoFromFilename(
        generateFilenameForBallotExportPackage(
          electionWithMsEitherNeitherDefinition,
          time
        )
      )
    ).toEqual({
      electionCounty:
        electionWithMsEitherNeitherDefinition.election.county.name.toLocaleLowerCase(),
      electionName:
        electionWithMsEitherNeitherDefinition.election.title.toLocaleLowerCase(),
      electionHash: electionWithMsEitherNeitherDefinition.electionHash.slice(
        0,
        10
      ),
      timestamp: time,
    });
  });
});

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

  test('generates election subfolder name as expected when election hash length varies', () => {
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

describe('generateCastVoteRecordReportDirectoryName', () => {
  test('generates basic scanning results filename in test mode', () => {
    const time = new Date(2019, 2, 14, 15, 9, 26);
    expect(
      generateCastVoteRecordReportDirectoryName('1', 0, true, time)
    ).toEqual('TEST__machine_1__0_ballots__2019-03-14_15-09-26');

    expect(
      generateCastVoteRecordReportDirectoryName('po!n@y:__', 35, true, time)
    ).toEqual('TEST__machine_pony__35_ballots__2019-03-14_15-09-26');
  });

  test('generates basic scanning results filename not in test mode', () => {
    const time = new Date(2019, 2, 14, 15, 9, 26);
    expect(
      generateCastVoteRecordReportDirectoryName('1', 0, false, time)
    ).toEqual('machine_1__0_ballots__2019-03-14_15-09-26');
    expect(
      generateCastVoteRecordReportDirectoryName(
        '<3-u!n#icorn<3',
        1,
        false,
        time
      )
    ).toEqual('machine_3unicorn3__1_ballot__2019-03-14_15-09-26');
  });

  test('generates basic scanning results filename with default time', () => {
    expect(generateCastVoteRecordReportDirectoryName('1', 0, false)).toEqual(
      expect.stringMatching('machine_1__0_ballots__')
    );
  });
});

test.each<{
  inTestMode: boolean;
  machineId: string;
  time: Date;
  expectedDirectoryName: string;
}>([
  {
    inTestMode: true,
    machineId: 'SCAN-0001',
    time: new Date(2023, 7, 16, 17, 2, 24),
    expectedDirectoryName: 'TEST__machine_SCAN-0001__2023-08-16_17-02-24',
  },
  {
    inTestMode: false,
    machineId: 'SCAN-0001',
    time: new Date(2023, 7, 16, 17, 2, 24),
    expectedDirectoryName: 'machine_SCAN-0001__2023-08-16_17-02-24',
  },
  {
    inTestMode: true,
    machineId: '<3-u!n#icorn<3',
    time: new Date(2023, 7, 16, 17, 2, 24),
    expectedDirectoryName: 'TEST__machine_3unicorn3__2023-08-16_17-02-24',
  },
])(
  'generateCastVoteRecordExportDirectoryName',
  ({ expectedDirectoryName, ...input }) => {
    expect(generateCastVoteRecordExportDirectoryName(input)).toEqual(
      expectedDirectoryName
    );
  }
);

test('generates ballot export package names as expected with simple inputs', () => {
  const mockElection: ElectionDefinition = {
    election: {
      ...electionWithMsEitherNeitherDefinition.election,
      county: { name: 'King County', id: '' },
      title: 'General Election',
    },
    electionHash: 'testHash12',
    electionData: '',
  };
  const time = new Date(2019, 2, 14, 15, 9, 26);
  expect(generateFilenameForBallotExportPackage(mockElection, time)).toEqual(
    'king-county_general-election_testHash12__2019-03-14_15-09-26.zip'
  );
});

test('generates ballot export package names as expected when election information has weird characters', () => {
  const mockElection: ElectionDefinition = {
    election: {
      ...electionWithMsEitherNeitherDefinition.election,
      county: { name: 'King County!!', id: '' },
      title: '-_General__Election$$',
    },
    electionHash: 'testHash12',
    electionData: '',
  };
  const time = new Date(2019, 2, 14, 15, 9, 26);
  expect(generateFilenameForBallotExportPackage(mockElection, time)).toEqual(
    'king-county_general-election_testHash12__2019-03-14_15-09-26.zip'
  );
  expect(generateFilenameForBallotExportPackage(mockElection)).toEqual(
    expect.stringMatching('king-county_general-election_testHash12__')
  );
});

test('generates ballot export package name with truncated election hash', () => {
  const mockElection: ElectionDefinition = {
    election: {
      ...electionWithMsEitherNeitherDefinition.election,
      county: { name: 'King County', id: '' },
      title: 'General Election',
    },
    electionHash: 'testHash123456789',
    electionData: '',
  };
  const time = new Date(2019, 2, 14, 15, 9, 26);
  expect(generateFilenameForBallotExportPackage(mockElection, time)).toEqual(
    'king-county_general-election_testHash12__2019-03-14_15-09-26.zip'
  );
});

test('generates ballot export package name with zero padded time pieces', () => {
  const mockElection: ElectionDefinition = {
    election: {
      ...electionWithMsEitherNeitherDefinition.election,
      county: { name: 'King County', id: '' },
      title: 'General Election',
    },
    electionHash: 'testHash12',
    electionData: '',
  };
  const time = new Date(2019, 2, 1, 1, 9, 2);
  expect(generateFilenameForBallotExportPackage(mockElection, time)).toEqual(
    'king-county_general-election_testHash12__2019-03-01_01-09-02.zip'
  );
});

describe('generateSemsFinalExportDefaultFilename', () => {
  test('generates the correct filename for test mode', () => {
    const mockElection: Election = {
      ...electionWithMsEitherNeitherDefinition.election,
      county: { name: 'King County', id: '' },
      title: 'General Election',
    };
    const time = new Date(2019, 2, 1, 1, 9, 2);
    expect(
      generateSemsFinalExportDefaultFilename(true, mockElection, time)
    ).toEqual(
      'votingworks-sems-test-results_king-county_general-election_2019-03-01_01-09-02.txt'
    );
  });

  test('generates the correct filename for live mode', () => {
    const time = new Date(2019, 2, 1, 1, 9, 2);
    const mockElection: Election = {
      ...electionWithMsEitherNeitherDefinition.election,
      county: { name: 'King County', id: '' },
      title: 'General Election',
    };
    expect(
      generateSemsFinalExportDefaultFilename(false, mockElection, time)
    ).toEqual(
      'votingworks-sems-live-results_king-county_general-election_2019-03-01_01-09-02.txt'
    );
    expect(generateSemsFinalExportDefaultFilename(false, mockElection)).toEqual(
      expect.stringMatching(
        'votingworks-sems-live-results_king-county_general-election'
      )
    );
  });
});

describe('generateFinalExportDefaultFilename', () => {
  test('generates the correct filename for test mode', () => {
    const mockElection: Election = {
      ...electionWithMsEitherNeitherDefinition.election,
      county: { name: 'King County', id: '' },
      title: 'General Election',
    };
    const time = new Date(2019, 2, 1, 1, 9, 2);
    expect(
      generateFinalExportDefaultFilename(true, mockElection, time)
    ).toEqual(
      'votingworks-test-results_king-county_general-election_2019-03-01_01-09-02.csv'
    );
  });

  test('generates the correct filename for live mode', () => {
    const time = new Date(2019, 2, 1, 1, 9, 2);
    const mockElection: Election = {
      ...electionWithMsEitherNeitherDefinition.election,
      county: { name: 'King County', id: '' },
      title: 'General Election',
    };
    expect(
      generateFinalExportDefaultFilename(false, mockElection, time)
    ).toEqual(
      'votingworks-live-results_king-county_general-election_2019-03-01_01-09-02.csv'
    );
    expect(generateFinalExportDefaultFilename(false, mockElection)).toEqual(
      expect.stringMatching(
        'votingworks-live-results_king-county_general-election'
      )
    );
  });
});

describe('parseCastVoteRecordReportDirectoryName', () => {
  test('parses a basic name not in test mode properly', () => {
    const name = 'machine_5__1_ballots__2020-12-08_10-42-02';
    const results = parseCastVoteRecordReportDirectoryName(name);
    expect(results).toEqual({
      isTestModeResults: false,
      machineId: '5',
      numberOfBallots: 1,
      timestamp: new Date(2020, 11, 8, 10, 42, 2),
    });
  });

  test('parses a basic name in test mode properly', () => {
    const name = 'TEST__machine_0002__54_ballots__2020-12-08_10-42-02';
    const results = parseCastVoteRecordReportDirectoryName(name);
    expect(results).toEqual({
      isTestModeResults: true,
      machineId: '0002',
      numberOfBallots: 54,
      timestamp: new Date(2020, 11, 8, 10, 42, 2),
    });
  });

  test('undefined when the format of the filename is unexpected', () => {
    expect(
      parseCastVoteRecordReportDirectoryName(
        'INVALID__machine_0002__54_ballots__2020-12-08_10-42-02'
      )
    ).toBeUndefined();
    expect(
      parseCastVoteRecordReportDirectoryName(
        '__machine_0002__54_ballots__2020-12-08_10-42-02'
      )
    ).toBeUndefined();
    expect(
      parseCastVoteRecordReportDirectoryName(
        'TEST__machine_0002__54_ballots__bad_timestamp'
      )
    ).toBeUndefined();
    expect(
      parseCastVoteRecordReportDirectoryName(
        'TEST__machine_0002__blah_ballots__2020-12-08_10-42-02'
      )
    ).toBeUndefined();
    expect(
      parseCastVoteRecordReportDirectoryName(
        'machine_0002__54_ballots__2020-12-08__10-42-02'
      )
    ).toBeUndefined();
    expect(
      parseCastVoteRecordReportDirectoryName(
        'TEST__something__machine_0002__54_ballots__2020-12-08_10-42-02'
      )
    ).toBeUndefined();
    expect(
      parseCastVoteRecordReportDirectoryName(
        'TEST__unicorn_0002__54_ballots__2020-12-08_10-42-02'
      )
    ).toBeUndefined();
    expect(
      parseCastVoteRecordReportDirectoryName(
        'TEST__machine_0002__54_puppies__2020-12-08_10-42-02'
      )
    ).toBeUndefined();
    expect(
      parseCastVoteRecordReportDirectoryName(
        'TEST__machine_0002__54__2020-12-08_10-42-02'
      )
    ).toBeUndefined();
    expect(
      parseCastVoteRecordReportDirectoryName(
        'TEST__0002__54_ballots__2020-12-08_10-42-02'
      )
    ).toBeUndefined();
  });

  test('works end to end with generating the report directory name', () => {
    const time = new Date(2020, 3, 14);
    const generatedName = generateCastVoteRecordReportDirectoryName(
      'machine',
      1234,
      true,
      time
    );
    expect(parseCastVoteRecordReportDirectoryName(generatedName)).toEqual({
      machineId: 'machine',
      numberOfBallots: 1234,
      isTestModeResults: true,
      timestamp: time,
    });

    const generatedName2 = generateCastVoteRecordReportDirectoryName(
      '0004',
      0,
      false,
      time
    );
    expect(parseCastVoteRecordReportDirectoryName(generatedName2)).toEqual({
      machineId: '0004',
      numberOfBallots: 0,
      isTestModeResults: false,
      timestamp: time,
    });

    const generatedName3 = generateCastVoteRecordReportDirectoryName(
      '0004',
      1,
      false,
      time
    );
    expect(parseCastVoteRecordReportDirectoryName(generatedName3)).toEqual({
      machineId: '0004',
      numberOfBallots: 1,
      isTestModeResults: false,
      timestamp: time,
    });
  });
});

function arbitraryMachineId(): fc.Arbitrary<string> {
  return fc.stringOf(
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-'),
    { minLength: 1 }
  );
}

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

function arbitraryCastVoteRecordReportListing(): fc.Arbitrary<CastVoteRecordReportListing> {
  return fc.record({
    machineId: arbitraryMachineId(),
    numberOfBallots: fc.nat(),
    isTestModeResults: fc.boolean(),
    timestamp: arbitraryTimestampDate(),
  });
}

test('generate/parse CVR file fuzzing', () => {
  fc.assert(
    fc.property(
      arbitraryCastVoteRecordReportListing(),
      (castVoteRecordReportListing) => {
        expect(
          parseCastVoteRecordReportDirectoryName(
            generateCastVoteRecordReportDirectoryName(
              castVoteRecordReportListing.machineId,
              castVoteRecordReportListing.numberOfBallots,
              castVoteRecordReportListing.isTestModeResults,
              castVoteRecordReportListing.timestamp
            )
          )
        ).toEqual(castVoteRecordReportListing);
      }
    )
  );
});

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

function arbitraryElectionData(): fc.Arbitrary<ElectionData> {
  return fc.record({
    electionCounty: arbitrarySafeName(),
    electionName: arbitrarySafeName(),
    electionHash: fc.hexaString({ minLength: 20, maxLength: 20 }),
    timestamp: arbitraryTimestampDate(),
  });
}

test('generate/parse ballot package filename fuzzing', () => {
  fc.assert(
    fc.property(arbitraryElectionData(), (electionData) => {
      expect(
        parseBallotExportPackageInfoFromFilename(
          generateFilenameForBallotExportPackageFromElectionData(electionData)
        )
      ).toEqual(
        typedAs<ElectionData>({
          electionCounty: electionData.electionCounty.toLocaleLowerCase(),
          electionHash: electionData.electionHash
            .toLocaleLowerCase()
            .slice(0, 10),
          electionName: electionData.electionName.toLocaleLowerCase(),
          timestamp: electionData.timestamp,
        })
      );
    })
  );
});

test('generateBatchResultsDefaultFilename', () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.constant(electionGeneralDefinition.election),
      fc.oneof(fc.constant(undefined), arbitraryTimestampDate()),
      (isTestModeResults, election, time) => {
        expect(
          generateBatchResultsDefaultFilename(isTestModeResults, election, time)
        ).toMatch(
          /^votingworks-(test|live)-batch-results_franklin-county_general-election_\d\d\d\d-\d\d-\d\d_\d\d-\d\d-\d\d.csv$/
        );
      }
    )
  );
});

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
