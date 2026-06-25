import { afterEach, expect, test, vi } from 'vitest';
import { assert, find, iter } from '@votingworks/basics';
import {
  readElectionStraightPartyDefinition,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import {
  CandidateContest,
  CastVoteRecordBatchMetadata,
  CVR,
  YesNoContest,
} from '@votingworks/types';
import {
  buildBatchManifest,
  buildCastVoteRecordReportMetadata,
} from './build_report_metadata';

const { election } = readElectionTwoPartyPrimaryDefinition();

const scannerId = 'SC-00-000';
const pollingPlaceId = 'polling-place-1';
const mockDate = new Date(2018, 5, 27, 0, 0, 0);
const electionId = '0000000000'; // fixed for resiliency to hash changes

afterEach(() => {
  vi.useRealTimers();
});

test('builds well-formed cast vote record report', () => {
  vi.useFakeTimers().setSystemTime(mockDate);
  const report = buildCastVoteRecordReportMetadata({
    election,
    electionId,
    generatingDeviceId: scannerId,
    scannerIds: [scannerId],
    reportTypes: [CVR.ReportType.OriginatingDeviceExport],
    isTestMode: false,
    batchInfo: [
      {
        id: 'batch-1',
        batchNumber: 1,
        label: 'Batch 1',
        startedAt: new Date(1989, 11, 13).toISOString(),
        endedAt: new Date(1989, 11, 14).toISOString(),
        count: 2,
        pollingPlaceId,
      },
    ],
  });

  expect(report.ReportType).toEqual([CVR.ReportType.OriginatingDeviceExport]);
  expect(report.OtherReportType).toBeUndefined();
  expect(report.Version).toEqual(CVR.CastVoteRecordVersion.v1_0_0);
  expect(report.GeneratedDate).toEqual('2018-06-27T08:00:00.000Z');
  expect(report.ReportGeneratingDeviceIds).toEqual([scannerId]);
  expect(report.ReportingDevice).toMatchObject([
    {
      '@id': scannerId,
      SerialNumber: scannerId,
      Manufacturer: 'VotingWorks',
    },
  ]);

  // Check GpUnits
  expect(report.GpUnit).toHaveLength(election.precincts.length + 2);
  for (const precinct of election.precincts) {
    expect(report.GpUnit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@id': precinct.id,
          Type: CVR.ReportingUnitType.Precinct,
          Name: precinct.name,
        }),
      ])
    );
  }
  expect(report.GpUnit).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        '@id': 'election-state',
        Type: CVR.ReportingUnitType.Other,
        Name: 'State of Sample',
      }),
    ])
  );
  expect(report.GpUnit).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        '@id': 'election-county',
        Type: CVR.ReportingUnitType.Other,
        Name: 'Sample County',
      }),
    ])
  );

  // Check parties
  expect(report.Party).toHaveLength(election.parties.length);
  for (const party of election.parties) {
    expect(report.Party).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@id': party.id,
          Name: party.fullName,
          Abbreviation: party.abbrev,
        }),
      ])
    );
  }

  const ReportElection = report.Election[0];
  assert(ReportElection);
  expect(ReportElection['@id']).toEqual(electionId);
  expect(ReportElection.Name).toEqual(election.title);

  // Check candidate list
  const candidateContests = election.contests.filter(
    (contest): contest is CandidateContest => contest.type === 'candidate'
  );
  expect(ReportElection.Candidate?.length).toEqual(
    iter(candidateContests)
      .map((contest) => contest.candidates.length)
      .sum()
  );
  for (const candidate of candidateContests.flatMap(
    (contest) => contest.candidates
  )) {
    expect(ReportElection.Candidate).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@id': candidate.id,
          Name: candidate.name,
        }),
      ])
    );
  }

  expect(ReportElection.Contest).toHaveLength(election.contests.length);

  // Check candidate contests
  const ReportCandidateContests = ReportElection.Contest.filter(
    (ReportContest): ReportContest is CVR.CandidateContest =>
      ReportContest['@type'] === 'CVR.CandidateContest'
  );
  expect(ReportCandidateContests).toHaveLength(candidateContests.length);
  for (const candidateContest of candidateContests) {
    const ReportCandidateContest = find(
      ReportCandidateContests,
      (c) => c['@id'] === candidateContest.id
    );
    expect(ReportCandidateContest.Name).toEqual(candidateContest.title);
    expect(ReportCandidateContest.VotesAllowed).toEqual(candidateContest.seats);
    expect(ReportCandidateContest.PrimaryPartyId).toEqual(
      candidateContest.partyId
    );
    expect(ReportCandidateContest.ContestSelection).toHaveLength(
      candidateContest.candidates.length +
        (candidateContest.allowWriteIns ? candidateContest.seats : 0)
    );
    for (const candidate of candidateContest.candidates) {
      expect(ReportCandidateContest.ContestSelection).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            '@id': candidate.id,
            CandidateIds: [candidate.id],
          }),
        ])
      );
    }
    if (candidateContest.allowWriteIns) {
      for (let i = 0; i < candidateContest.seats; i += 1) {
        expect(ReportCandidateContest.ContestSelection).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              '@id': `write-in-${i}`,
              IsWriteIn: true,
            }),
          ])
        );
      }
    }
  }

  // Check ballot measure contests
  const ballotMeasureContests = election.contests.filter(
    (contest): contest is YesNoContest => contest.type === 'yesno'
  );
  const ReportBallotMeasureContests = ReportElection.Contest.filter(
    (ReportContest): ReportContest is CVR.BallotMeasureContest =>
      ReportContest['@type'] === 'CVR.BallotMeasureContest'
  );
  expect(ReportBallotMeasureContests).toHaveLength(
    ballotMeasureContests.length
  );
  for (const ballotMeasureContest of ballotMeasureContests) {
    expect(ReportBallotMeasureContests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@id': ballotMeasureContest.id,
          Name: ballotMeasureContest.title,
          ContestSelection: ballotMeasureContest.options.map((option) =>
            expect.objectContaining({
              '@id': option.id,
              Selection: option.label,
            })
          ),
        }),
      ])
    );
  }
});

test('fishing ballot measure includes regulate-fishing as a third BallotMeasureSelection', () => {
  const report = buildCastVoteRecordReportMetadata({
    election,
    electionId,
    generatingDeviceId: scannerId,
    scannerIds: [scannerId],
    reportTypes: [CVR.ReportType.OriginatingDeviceExport],
    isTestMode: false,
    batchInfo: [],
  });

  const ReportElection = report.Election[0];
  assert(ReportElection);

  const fishingContest = find(
    ReportElection.Contest,
    (c): c is CVR.BallotMeasureContest =>
      c['@type'] === 'CVR.BallotMeasureContest' && c['@id'] === 'fishing'
  );

  expect(fishingContest.ContestSelection).toHaveLength(3);
  expect(fishingContest.ContestSelection).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ '@id': 'ban-fishing', Selection: 'YES' }),
      expect.objectContaining({ '@id': 'allow-fishing', Selection: 'NO' }),
      expect.objectContaining({
        '@id': 'regulate-fishing',
        Selection: 'REGULATE',
      }),
    ])
  );
});

test('builds straight party contests as CVR.PartyContest', () => {
  const { election: straightPartyElection } =
    readElectionStraightPartyDefinition();
  const report = buildCastVoteRecordReportMetadata({
    election: straightPartyElection,
    electionId,
    generatingDeviceId: scannerId,
    scannerIds: [scannerId],
    reportTypes: [CVR.ReportType.OriginatingDeviceExport],
    isTestMode: false,
    batchInfo: [],
  });

  const contests = report.Election[0]!.Contest;
  const partyContest = find(
    contests,
    (contest) => contest['@id'] === 'straight-party-ticket'
  );
  expect(partyContest).toEqual({
    '@type': 'CVR.PartyContest',
    '@id': 'straight-party-ticket',
    Name: 'Straight Party',
    ContestSelection: [
      { '@type': 'CVR.PartySelection', '@id': '0', PartyIds: ['0'] },
      { '@type': 'CVR.PartySelection', '@id': '1', PartyIds: ['1'] },
      { '@type': 'CVR.PartySelection', '@id': '2', PartyIds: ['2'] },
      { '@type': 'CVR.PartySelection', '@id': '3', PartyIds: ['3'] },
      { '@type': 'CVR.PartySelection', '@id': '4', PartyIds: ['4'] },
      { '@type': 'CVR.PartySelection', '@id': '5', PartyIds: ['5'] },
      { '@type': 'CVR.PartySelection', '@id': '6', PartyIds: ['6'] },
      { '@type': 'CVR.PartySelection', '@id': '7', PartyIds: ['7'] },
      { '@type': 'CVR.PartySelection', '@id': '8', PartyIds: ['8'] },
    ],
  });
});

test('represents test mode as an "OtherReportType"', () => {
  const report = buildCastVoteRecordReportMetadata({
    election,
    electionId,
    generatingDeviceId: scannerId,
    scannerIds: [scannerId],
    reportTypes: [CVR.ReportType.OriginatingDeviceExport],
    isTestMode: true,
    batchInfo: [],
  });

  expect(report.ReportType).toEqual([
    CVR.ReportType.OriginatingDeviceExport,
    CVR.ReportType.Other,
  ]);
  expect(report.OtherReportType).toEqual('test');
});

test('still includes the generating device id in the device list if it is not the scanner id', () => {
  const generatingDeviceId = 'AD-00-000';
  const report = buildCastVoteRecordReportMetadata({
    election,
    electionId,
    generatingDeviceId,
    scannerIds: [scannerId],
    reportTypes: [CVR.ReportType.OriginatingDeviceExport],
    isTestMode: true,
    batchInfo: [],
  });

  expect(report.ReportGeneratingDeviceIds).toEqual([generatingDeviceId]);
  expect(report.ReportingDevice).toMatchObject(
    expect.arrayContaining([
      expect.objectContaining({
        '@id': scannerId,
        SerialNumber: scannerId,
        Manufacturer: 'VotingWorks',
      }),
      expect.objectContaining({
        '@id': generatingDeviceId,
        SerialNumber: generatingDeviceId,
        Manufacturer: 'VotingWorks',
      }),
    ])
  );
});

test('buildBatchManifest', () => {
  expect(
    buildBatchManifest({
      batches: [
        {
          id: 'batch-1',
          batchNumber: 1,
          label: 'Batch 1',
          startedAt: new Date(1989, 11, 13).toISOString(),
          endedAt: new Date(1989, 11, 14).toISOString(),
          count: 2,
          ballotCastingMode: 'early_voting',
          pollingPlaceId: 'polling-place-1',
        },
      ],
      scannerId,
    })
  ).toEqual<CastVoteRecordBatchMetadata[]>([
    {
      id: 'batch-1',
      label: 'Batch 1',
      batchNumber: 1,
      startTime: new Date(1989, 11, 13).toISOString(),
      endTime: new Date(1989, 11, 14).toISOString(),
      sheetCount: 2,
      scannerId,
      ballotCastingMode: 'early_voting',
      pollingPlaceId: 'polling-place-1',
    },
  ]);
});

test('buildBatchManifest - optional fields omitted', () => {
  expect(
    buildBatchManifest({
      batches: [
        {
          id: 'batch-1',
          batchNumber: 1,
          label: 'Batch 1',
          startedAt: new Date(1989, 11, 13).toISOString(),
          count: 2,
          pollingPlaceId,
        },
      ],
      scannerId,
    })
  ).toEqual<CastVoteRecordBatchMetadata[]>([
    {
      id: 'batch-1',
      label: 'Batch 1',
      batchNumber: 1,
      startTime: new Date(1989, 11, 13).toISOString(),
      sheetCount: 2,
      scannerId,
      pollingPlaceId,
    },
  ]);
});
