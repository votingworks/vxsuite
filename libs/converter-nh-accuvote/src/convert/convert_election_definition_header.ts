import { assertDefined, err, iter, ok, Optional } from '@votingworks/basics';
import {
  BallotPaperSize,
  Candidate,
  CandidateContest,
  Election,
  Party,
  safeParseElection,
  safeParseNumber,
  YesNoContest,
} from '@votingworks/types';
import { DateTime } from 'luxon';
import * as accuvote from './accuvote';
import {
  AccuVoteDataToIdMap,
  AccuVoteDataToIdMapImpl,
} from './accuvote_data_to_id_map';
import { NH_SEAL } from './seal';
import { ConvertIssue, ConvertIssueKind, ResultWithIssues } from './types';

function parseDate(rawDate: string): Optional<DateTime> {
  const dateFormats = ['M/d/yyyy HH:mm:ss', 'M/dd/yyyy'];
  return dateFormats
    .map((format) =>
      DateTime.fromFormat(rawDate.trim(), format, {
        locale: 'en-US',
        zone: 'America/New_York',
      })
    )
    .find((date) => date.isValid);
}

/**
 * Parses the ballot paper size from the AccuVote ballot size.
 */
export function parseBallotPaperSize(
  ballotSize: string
): Optional<BallotPaperSize> {
  switch (ballotSize) {
    case '8.5X11':
      return BallotPaperSize.Letter;

    case '8.5X14':
      return BallotPaperSize.Legal;

    case '8.5X17':
      return BallotPaperSize.Custom17;

    case '8.5X18':
      return BallotPaperSize.Custom18;

    case '8.5X21':
      return BallotPaperSize.Custom21;

    case '8.5X22':
      return BallotPaperSize.Custom22;

    default:
      return undefined;
  }
}

/**
 * Result of converting an AccuVote election definition header.
 */
export interface ConvertElectionDefinitionHeaderResult {
  election: Election;
  accuVoteToIdMap: AccuVoteDataToIdMap;
}

/**
 * Creates an election definition only from the ballot metadata, ignoring the
 * ballot images.
 */
export function convertElectionDefinitionHeader(
  avsInterface: accuvote.AvsInterface
): ResultWithIssues<ConvertElectionDefinitionHeaderResult> {
  const {
    ballotSize,
    electionDate: rawDate,
    electionName: title,
    partyName: electionPartyName,
    precinctId: rawPrecinctId,
    townName,
    townId,
  } = avsInterface.accuvoteHeaderInfo;
  const accuVoteToIdMap = new AccuVoteDataToIdMapImpl();

  const parsedDate = parseDate(rawDate);
  if (!parsedDate) {
    return err({
      issues: [
        {
          kind: ConvertIssueKind.InvalidElectionDate,
          message: 'invalid date',
          invalidDate: rawDate,
        },
      ],
    });
  }

  const precinctId = accuVoteToIdMap.precinctId(townId, rawPrecinctId);
  const districtId = accuVoteToIdMap.districtId([precinctId]);

  const paperSize = parseBallotPaperSize(ballotSize);
  if (!paperSize) {
    return err({
      issues: [
        {
          kind: ConvertIssueKind.InvalidBallotSize,
          message: `invalid ballot size: ${ballotSize}`,
          invalidBallotSize: ballotSize,
        },
      ],
    });
  }

  const electionParty: Party | undefined = electionPartyName
    ? {
        id: accuVoteToIdMap.partyId(electionPartyName),
        name: electionPartyName,
        fullName: electionPartyName,
        abbrev: electionPartyName,
      }
    : undefined;

  const parties = new Map<string, Party>();
  if (electionPartyName) {
    parties.set(electionPartyName, assertDefined(electionParty));
  }

  const contests: Array<CandidateContest | YesNoContest> = [];
  for (const candidateContest of avsInterface.candidates) {
    const { winnerNote } = candidateContest.officeName;
    const seats =
      safeParseNumber(
        winnerNote?.match(/Vote for not more than (\d+)/)?.[1]
      ).ok() ??
      safeParseNumber(winnerNote?.match(/Vote for up to (\d+)/)?.[1]).ok() ??
      1;

    const [writeInCandidates, nonWriteInCandidates] = iter(
      candidateContest.candidateNames
    ).partition((candidate) => candidate.writeIn);

    const candidates: Candidate[] = [];
    for (const nonWriteInCandidate of nonWriteInCandidates) {
      const candidateName = nonWriteInCandidate.name;

      let party: Party | undefined;
      const partyName = nonWriteInCandidate.party;
      if (partyName) {
        party = parties.get(partyName);
        if (!party) {
          party = {
            id: accuVoteToIdMap.partyId(partyName),
            name: partyName,
            fullName: partyName,
            abbrev: partyName,
          };
          parties.set(partyName, party);
        }
      }

      const candidateId = accuVoteToIdMap.candidateId(nonWriteInCandidate);
      const existingCandidateIndex = candidates.findIndex(
        (candidate) => candidate.id === candidateId
      );

      if (existingCandidateIndex >= 0) {
        const existingPartyIds = candidates[existingCandidateIndex]?.partyIds;
        if (!party || !existingPartyIds) {
          return err({
            issues: [
              {
                kind: ConvertIssueKind.MissingDefinitionProperty,
                message: `Party is missing in candidate "${candidateName}" of office "${candidateContest.officeName.name}", required for multi-party endorsement`,
                property: 'AVSInterface > Candidates > CandidateName > Party',
              },
            ],
          });
        }

        candidates[existingCandidateIndex] = {
          id: candidateId,
          name: candidateName,
          partyIds: [...existingPartyIds, party.id],
        };
      } else {
        const candidate: Candidate = {
          id: candidateId,
          name: candidateName,
          ...(party ? { partyIds: [party.id] } : {}),
        };
        candidates.push(candidate);
      }
    }

    const contestId = accuVoteToIdMap.candidateContestId(
      candidateContest,
      electionPartyName
    );

    contests.push({
      type: 'candidate',
      id: contestId,
      title: candidateContest.officeName.name,
      districtId,
      seats,
      allowWriteIns: writeInCandidates.length > 0,
      candidates,
      partyId: electionParty?.id,
    });
  }

  for (const [i, yesNoQuestion] of avsInterface.yesNoQuestions.entries()) {
    const contestTitle = `Constitutional Amendment Question #${i + 1}`;
    const contestId = accuVoteToIdMap.yesNoContestId(yesNoQuestion);
    const yesOptionId = accuVoteToIdMap.yesOptionId(yesNoQuestion);
    const noOptionId = accuVoteToIdMap.noOptionId(yesNoQuestion);

    contests.push({
      type: 'yesno',
      id: contestId,
      title: contestTitle,
      description: yesNoQuestion.title,
      districtId,
      yesOption: {
        id: yesOptionId,
        label: 'Yes',
      },
      noOption: {
        id: noOptionId,
        label: 'No',
      },
    });
  }

  const issues: ConvertIssue[] = [];
  const questions = avsInterface.ballotPaperInfo?.questions;

  if (questions) {
    issues.push({
      kind: ConvertIssueKind.ConstitutionalQuestionError,
      message: `Unexpected questions in ballot paper info`,
    });
  }

  const election: Election = {
    type: electionParty ? 'primary' : 'general',
    title,
    date: parsedDate.toISO(),
    county: {
      id: townId,
      name: townName,
    },
    state: 'NH',
    parties: Array.from(parties.values()),
    precincts: [
      {
        id: precinctId,
        name: townName,
      },
    ],
    districts: [
      {
        id: districtId,
        name: townName,
      },
    ],
    ballotStyles: [
      {
        id: 'default',
        districts: [districtId],
        precincts: [precinctId],
        partyId: electionParty?.id,
      },
    ],
    contests,
    ballotLayout: {
      paperSize,
      metadataEncoding: 'qr-code',
    },
    seal: NH_SEAL,
  };

  const parseElectionResult = safeParseElection(election);

  if (parseElectionResult.isErr()) {
    return err({
      issues: [
        {
          kind: ConvertIssueKind.ElectionValidationFailed,
          message: parseElectionResult.err().message,
          validationError: parseElectionResult.err(),
        },
      ],
    });
  }

  return ok({
    result: {
      election: parseElectionResult.ok(),
      accuVoteToIdMap,
    },
    issues,
  });
}
