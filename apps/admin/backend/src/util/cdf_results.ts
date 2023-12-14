import {
  CandidateContest,
  Election,
  ResultsReporting,
  Tabulation,
  YesNoContest,
} from '@votingworks/types';
import { getBallotCount } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { MachineConfig, WriteInCandidateRecord } from '../types';

function getVendorApplicationId(machineConfig: MachineConfig): string {
  return `VxAdmin, version ${machineConfig.codeVersion}`;
}

function getStateId(election: Election): string {
  return election.state.toLowerCase().replaceAll(' ', '-');
}

function asInternationalizedText(
  text: string
): ResultsReporting.InternationalizedText {
  return {
    '@type': 'ElectionResults.InternationalizedText',
    Text: [
      {
        '@type': 'ElectionResults.LanguageString',
        Language: 'en',
        Content: text,
      },
    ],
  };
}

function buildParties(election: Election): ResultsReporting.Party[] {
  return election.parties.map((party) => ({
    '@type': 'ElectionResults.Party',
    '@id': party.id,
    Name: asInternationalizedText(party.name),
    Abbreviation: asInternationalizedText(party.abbrev),
  }));
}

function getElectionType(election: Election): ResultsReporting.ElectionType {
  return election.type === 'general'
    ? ResultsReporting.ElectionType.General
    : ResultsReporting.ElectionType.Primary;
}

function buildOfficialCandidates(
  election: Election
): ResultsReporting.Candidate[] {
  const candidates = election.contests
    .filter(
      (contest): contest is CandidateContest => contest.type === 'candidate'
    )
    .flatMap((contest) => contest.candidates);

  return candidates.map((candidate) => ({
    '@type': 'ElectionResults.Candidate',
    '@id': candidate.id,
    /* c8 ignore next 1 -- trivial fallthrough case */
    PartyId: candidate.partyIds?.[0],
    BallotName: asInternationalizedText(candidate.name),
  }));
}

const PENDING_WRITE_IN_CANDIDATE: ResultsReporting.Candidate = {
  '@type': 'ElectionResults.Candidate',
  '@id': Tabulation.GENERIC_WRITE_IN_ID,
  BallotName: asInternationalizedText(Tabulation.GENERIC_WRITE_IN_NAME),
};

function buildWriteInCandidates(
  writeInCandidates: WriteInCandidateRecord[]
): ResultsReporting.Candidate[] {
  return [
    ...writeInCandidates.map((candidate) => ({
      '@type': 'ElectionResults.Candidate' as const,
      '@id': candidate.id,
      BallotName: asInternationalizedText(candidate.name),
    })),
    PENDING_WRITE_IN_CANDIDATE,
  ];
}

function buildBallotMeasureContest(
  contest: YesNoContest,
  results: Tabulation.YesNoContestResults
): ResultsReporting.BallotMeasureContest {
  return {
    '@type': 'ElectionResults.BallotMeasureContest',
    '@id': contest.id,
    Name: contest.title,
    ElectionDistrictId: contest.districtId,
    ContestSelection: [
      {
        '@type': 'ElectionResults.BallotMeasureSelection',
        '@id': contest.yesOption.id,
        Selection: asInternationalizedText(contest.yesOption.label),
        VoteCounts: [
          {
            '@type': 'ElectionResults.VoteCounts',
            Count: results.yesTally,
            GpUnitId: contest.districtId,
            Type: ResultsReporting.CountItemType.Total,
          },
        ],
      },
      {
        '@type': 'ElectionResults.BallotMeasureSelection',
        '@id': contest.noOption.id,
        Selection: asInternationalizedText(contest.noOption.label),
        VoteCounts: [
          {
            '@type': 'ElectionResults.VoteCounts',
            Count: results.noTally,
            GpUnitId: contest.districtId,
            Type: ResultsReporting.CountItemType.Total,
          },
        ],
      },
    ],
    OtherCounts: [
      {
        '@type': 'ElectionResults.OtherCounts',
        GpUnitId: contest.districtId,
        Overvotes: results.overvotes,
        Undervotes: results.undervotes,
      },
    ],
  };
}

function buildCandidateContest(
  contest: CandidateContest,
  results: Tabulation.CandidateContestResults
): ResultsReporting.CandidateContest {
  return {
    '@type': 'ElectionResults.CandidateContest',
    '@id': contest.id,
    Name: contest.title,
    ElectionDistrictId: contest.districtId,
    VotesAllowed: results.votesAllowed,
    ContestSelection: Object.values(results.tallies).map((candidateTally) => ({
      '@type': 'ElectionResults.CandidateSelection',
      '@id': candidateTally.id,
      IsWriteIn: candidateTally.isWriteIn,
      VoteCounts: [
        {
          '@type': 'ElectionResults.VoteCounts',
          GpUnitId: contest.districtId,
          Count: candidateTally.tally,
          Type: ResultsReporting.CountItemType.Total,
        },
      ],
    })),
    OtherCounts: [
      {
        '@type': 'ElectionResults.OtherCounts',
        GpUnitId: contest.districtId,
        Overvotes: results.overvotes,
        Undervotes: results.undervotes,
      },
    ],
  };
}

type ReportContest =
  | ResultsReporting.BallotMeasureContest
  | ResultsReporting.CandidateContest;

function buildContests(
  election: Election,
  electionResults: Tabulation.ElectionResults
): ReportContest[] {
  const reportContests: ReportContest[] = [];

  for (const contest of election.contests) {
    const contestResults = electionResults.contestResults[contest.id];
    assert(contestResults);
    if (contest.type === 'yesno') {
      assert(contestResults.contestType === 'yesno');
      reportContests.push(buildBallotMeasureContest(contest, contestResults));
    } else {
      assert(contestResults.contestType === 'candidate');
      reportContests.push(buildCandidateContest(contest, contestResults));
    }
  }

  return reportContests;
}

/**
 *
 */
export function buildElectionResultsReport({
  election,
  electionResults,
  writeInCandidates,
  isTestMode,
  machineConfig,
  isOfficialResults,
}: {
  election: Election;
  electionResults: Tabulation.ElectionResults;
  writeInCandidates: WriteInCandidateRecord[];
  isTestMode: boolean;
  machineConfig: MachineConfig;
  isOfficialResults: boolean;
}): ResultsReporting.ElectionReport {
  const stateId = getStateId(election);

  return {
    '@type': 'ElectionResults.ElectionReport',
    Format: ResultsReporting.ReportDetailLevel.SummaryContest,
    IsTest: isTestMode,
    SequenceStart: 1,
    SequenceEnd: 1,
    // CDF DateWithTimeZone format doesn't allow milliseconds, so remove them
    GeneratedDate: new Date().toISOString().replace(/\.\d{3}/, ''),
    Issuer: election.county.name,
    IssuerAbbreviation: election.county.id,
    VendorApplicationId: getVendorApplicationId(machineConfig),
    Status: isOfficialResults
      ? ResultsReporting.ResultsStatus.Certified
      : ResultsReporting.ResultsStatus.UnofficialComplete,
    Party: buildParties(election),
    Election: [
      {
        '@type': 'ElectionResults.Election',
        StartDate: election.date,
        EndDate: election.date,
        Name: asInternationalizedText(election.title),
        ElectionScopeId: stateId,
        Type: getElectionType(election),
        BallotCounts: [
          {
            '@type': 'ElectionResults.BallotCounts',
            Type: ResultsReporting.CountItemType.Total,
            GpUnitId: election.county.id,
            BallotsCast: getBallotCount(electionResults.cardCounts),
          },
        ],
        Candidate: [
          ...buildOfficialCandidates(election),
          ...buildWriteInCandidates(writeInCandidates),
        ],
        Contest: buildContests(election, electionResults),
      },
    ],
    GpUnit: [
      {
        '@type': 'ElectionResults.ReportingUnit',
        '@id': stateId,
        Name: asInternationalizedText(election.state),
        Type: ResultsReporting.ReportingUnitType.State,
        ComposingGpUnitIds: [election.county.id],
      },
      {
        '@type': 'ElectionResults.ReportingUnit',
        '@id': election.county.id,
        Name: asInternationalizedText(election.county.name),
        Type: ResultsReporting.ReportingUnitType.County,
        ComposingGpUnitIds: election.districts.map((district) => district.id),
      },
      ...election.districts.map(
        (district): ResultsReporting.ReportingUnit => ({
          '@type': 'ElectionResults.ReportingUnit',
          '@id': district.id,
          Name: asInternationalizedText(district.name),
          Type: ResultsReporting.ReportingUnitType.Other,
        })
      ),
    ],
  };
}
