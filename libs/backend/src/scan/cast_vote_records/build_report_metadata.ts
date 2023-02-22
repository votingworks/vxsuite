import {
  AnyContest,
  CandidateContest,
  CVR,
  Election,
  YesNoContest,
} from '@votingworks/types';

function buildWriteInCandidateSelections(
  contest: CandidateContest
): CVR.CandidateSelection[] {
  if (!contest.allowWriteIns) {
    return [];
  }

  const writeInSelections: CVR.CandidateSelection[] = [];
  for (let i = 0; i < contest.seats; i += 1) {
    writeInSelections.push({
      '@type': 'CVR.CandidateSelection',
      '@id': `write-in-${i}`,
      IsWriteIn: true,
    });
  }

  return writeInSelections;
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
        '@id': 'yes',
        // TODO: always use the yesOption once it is required
        Selection: 'yes' || contest.yesOption?.label,
      },
      {
        '@type': 'CVR.BallotMeasureSelection',
        '@id': 'no',
        // TODO: always use the noOption once it is required
        Selection: 'no' || contest.noOption?.label,
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
    .filter((c): c is CandidateContest => c.type === 'candidate')
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
    Candidate: allCandidatesDeduplicated.map((candidate) => {
      return {
        '@type': 'CVR.Candidate',
        '@id': candidate.id,
        Name: candidate.name,
      };
    }),
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

interface BuildCastVoteRecordReportParams {
  election: Election;
  electionId: string;
  generatingDeviceId: string;
  scannerIds: string[];
  reportTypes: CVR.ReportType[];
  isTestMode: boolean;
  batchInfo: Array<{ id: string; label: string }>;
}

/**
 * Builds a CDF "cast vote record report" without any CVRs. It is the metadata
 * necessary to make sense of those CVRs. We generate this separately because
 * we want to write the CVRs to file separately, one-by-one.
 */
export function buildCastVoteRecordReport({
  election,
  electionId,
  generatingDeviceId,
  scannerIds,
  reportTypes,
  isTestMode,
  batchInfo,
}: BuildCastVoteRecordReportParams): CVR.CastVoteRecordReport {
  // TODO: pull from ballot definition once it exists. For now, the scope
  // is just the current state
  const electionScopeId = 'election-state';

  return {
    '@type': 'CVR.CastVoteRecordReport',
    Version: CVR.CastVoteRecordVersion.v1_0_0,
    ReportType: isTestMode
      ? [...reportTypes, CVR.ReportType.Other]
      : reportTypes,
    OtherReportType: isTestMode ? 'test' : undefined,
    GeneratedDate: new Date().toISOString(),
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
    Batch: batchInfo.map((batch) => ({
      '@type': 'CVR.vxBatch',
      '@id': batch.id,
      BatchLabel: batch.label,
    })),
  };
}
