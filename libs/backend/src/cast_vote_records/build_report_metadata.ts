import { integers } from '@votingworks/basics';
import {
  AnyContest,
  BatchInfo,
  CandidateContest,
  CastVoteRecordBatchMetadata,
  CVR,
  Election,
  YesNoContest,
} from '@votingworks/types';

/**
 * If the report is a test report, this value will be included in the
 * {@link CVR.OtherReportType} string within a comma-separated list.
 */
export const TEST_OTHER_REPORT_TYPE = 'test';

/**
 * The metadata is the cast vote record report without the cast vote records themselves.
 */
export type CastVoteRecordReportMetadata = Omit<
  CVR.CastVoteRecordReport,
  'CVR'
>;

function* buildWriteInCandidateSelections(
  contest: CandidateContest
): Generator<CVR.CandidateSelection> {
  if (!contest.allowWriteIns) {
    return;
  }

  for (const i of integers().take(contest.seats)) {
    yield {
      '@type': 'CVR.CandidateSelection',
      '@id': `write-in-${i}`,
      IsWriteIn: true,
    };
  }
}

function buildCandidateContest(
  contest: CandidateContest
): CVR.CandidateContest {
  return {
    '@id': contest.id,
    '@type': 'CVR.CandidateContest',
    Name: contest.title,
    VotesAllowed: contest.seats,
    ContestSelection: [
      ...contest.candidates.map(
        (candidate): CVR.CandidateSelection => ({
          '@id': candidate.id,
          '@type': 'CVR.CandidateSelection',
          CandidateIds: [candidate.id],
        })
      ),
      ...buildWriteInCandidateSelections(contest),
    ],
    PrimaryPartyId: contest.partyId,
  };
}

function buildBallotMeasureContest(
  contest: YesNoContest
): CVR.BallotMeasureContest {
  return {
    '@id': contest.id,
    '@type': 'CVR.BallotMeasureContest',
    Name: contest.title,
    ContestSelection: [
      {
        '@type': 'CVR.BallotMeasureSelection',
        '@id': contest.yesOption.id,
        Selection: contest.yesOption.label,
      },
      {
        '@type': 'CVR.BallotMeasureSelection',
        '@id': contest.noOption.id,
        Selection: contest.noOption.label,
      },
    ],
  };
}

function buildContest(
  contest: AnyContest
): CVR.CandidateContest | CVR.BallotMeasureContest {
  return contest.type === 'candidate'
    ? buildCandidateContest(contest)
    : buildBallotMeasureContest(contest);
}

function buildElection({
  election,
  electionId,
  electionScopeId,
}: {
  election: Election;
  electionId: string;
  electionScopeId: string;
}): CVR.Election {
  const allCandidates = election.contests
    .filter((c) => c.type === 'candidate')
    .flatMap((c) => c.candidates);

  // The VotingWorks election format nests candidate definitions under
  // each contest, meaning that it's possible a candidate is defined twice
  // in separate contests. Although unlikely, we deduplicate by ID here
  const allCandidatesDeduplicated = [
    ...new Map(allCandidates.map((c) => [c.id, c])).values(),
  ];

  return {
    '@type': 'CVR.Election',
    '@id': electionId,
    Name: election.title,
    Candidate: allCandidatesDeduplicated.map((candidate) => ({
      '@type': 'CVR.Candidate',
      '@id': candidate.id,
      Name: candidate.name,
    })),
    Contest: election.contests.map(buildContest),
    ElectionScopeId: electionScopeId,
  };
}

function buildReportingDevices(
  generatingDeviceId: string,
  scannerIds: string[]
): CVR.ReportingDevice[] {
  const allDeviceIds = scannerIds.includes(generatingDeviceId)
    ? scannerIds
    : [generatingDeviceId, ...scannerIds];

  return allDeviceIds.map((deviceId) => ({
    '@type': 'CVR.ReportingDevice',
    '@id': deviceId,
    SerialNumber: deviceId,
    Manufacturer: 'VotingWorks',
  }));
}

interface BuildCastVoteRecordReportMetadataParams {
  election: Election;
  electionId: string;
  generatingDeviceId: string;
  scannerIds: string[];
  reportTypes: CVR.ReportType[];
  isTestMode: boolean;
  batchInfo: BatchInfo[];
  generatedDate?: Date;
}

/**
 * Builds a CDF "cast vote record report" without any CVRs. It is the metadata
 * necessary to make sense of those CVRs. We generate this separately because
 * we want to write the CVRs to file separately, one-by-one.
 */
export function buildCastVoteRecordReportMetadata({
  election,
  electionId,
  generatingDeviceId,
  scannerIds,
  reportTypes,
  isTestMode,
  generatedDate = new Date(),
}: BuildCastVoteRecordReportMetadataParams): CastVoteRecordReportMetadata {
  // TODO: pull from ballot definition once it exists. For now, the scope
  // is just the current state
  const electionScopeId = 'election-state';

  return {
    '@type': 'CVR.CastVoteRecordReport',
    Version: CVR.CastVoteRecordVersion.v1_0_0,
    ReportType: isTestMode
      ? [...reportTypes, CVR.ReportType.Other]
      : reportTypes,
    OtherReportType: isTestMode ? TEST_OTHER_REPORT_TYPE : undefined,
    GeneratedDate: generatedDate.toISOString(),
    // VVSG 2.0 1.1.5-G.1 requires identification of the creating device
    ReportGeneratingDeviceIds: [generatingDeviceId],
    ReportingDevice: buildReportingDevices(generatingDeviceId, scannerIds),
    Party: election.parties.map((party) => ({
      '@type': 'CVR.Party',
      '@id': party.id,
      Name: party.fullName,
      Abbreviation: party.abbrev,
    })),
    Election: [
      buildElection({
        election,
        electionId,
        electionScopeId,
      }),
    ],
    GpUnit: [
      ...election.precincts.map(
        (precinct): CVR.GpUnit => ({
          '@type': 'CVR.GpUnit',
          '@id': precinct.id,
          Type: CVR.ReportingUnitType.Precinct,
          Name: precinct.name,
        })
      ),
      // VVSG 1.1.5-G.2 requires identification of the geographical location of the device
      {
        '@type': 'CVR.GpUnit',
        '@id': 'election-county',
        Type: CVR.ReportingUnitType.Other,
        Name: `${election.county.name}`,
      },
      {
        '@type': 'CVR.GpUnit',
        '@id': electionScopeId,
        Type: CVR.ReportingUnitType.Other,
        Name: `${election.state}`,
      },
    ],
  };
}

/**
 * Build that batch manifest that is included in the cast vote record export metadata file.
 */
export function buildBatchManifest({
  batchInfo,
}: {
  batchInfo: Array<BatchInfo & { scannerId: string }>;
}): CastVoteRecordBatchMetadata[] {
  return batchInfo.map((batch) => ({
    id: batch.id,
    label: batch.label,
    batchNumber: batch.batchNumber,
    startTime: batch.startedAt,
    endTime: batch.endedAt,
    sheetCount: batch.count,
    scannerId: batch.scannerId,
  }));
}
