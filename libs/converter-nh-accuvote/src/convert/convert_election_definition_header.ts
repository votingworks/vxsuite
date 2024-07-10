import { assert, assertDefined, err, iter, ok } from '@votingworks/basics';
import {
  BallotPaperSize,
  Candidate,
  CandidateContest,
  DistrictIdSchema,
  Election,
  GridPositionOption,
  GridPositionWriteIn,
  Party,
  PartyIdSchema,
  YesNoContest,
  safeParse,
  safeParseElection,
  safeParseNumber,
  unsafeParse,
} from '@votingworks/types';
import makeDebug from 'debug';
import { decode as decodeHtmlEntities } from 'he';
import { DateTime } from 'luxon';
import { sha256 } from 'js-sha256';
import { parseConstitutionalQuestions } from './parse_constitutional_questions';
import {
  ConvertIssue,
  ConvertIssueKind,
  NewHampshireBallotCardDefinition,
  ResultWithIssues,
} from './types';
import { readGridFromElectionDefinition } from './read_grid_from_election_definition';
import { NH_SEAL } from './seal';

const debug = makeDebug('converter-nh-accuvote:convert');

function makeId(text: string): string {
  const hash = sha256(text);
  return `${text.replace(/[^-_a-z\d+]+/gi, '-').slice(0, 64)}-${hash.slice(
    0,
    8
  )}`;
}

/**
 * Creates an election definition only from the ballot metadata, ignoring the
 * ballot images.
 */
export function convertElectionDefinitionHeader(
  definition: NewHampshireBallotCardDefinition['definition']
): ResultWithIssues<Election> {
  const root = definition;
  const accuvoteHeaderInfo = root.getElementsByTagName('AccuvoteHeaderInfo')[0];
  const electionId =
    accuvoteHeaderInfo?.getElementsByTagName('ElectionID')[0]?.textContent;
  if (typeof electionId !== 'string') {
    return err({
      issues: [
        {
          kind: ConvertIssueKind.MissingDefinitionProperty,
          message: 'ElectionID is missing',
          property: 'AVSInterface > AccuvoteHeaderInfo > ElectionID',
        },
      ],
    });
  }

  const title =
    accuvoteHeaderInfo?.getElementsByTagName('ElectionName')[0]?.textContent;
  if (typeof title !== 'string') {
    return err({
      issues: [
        {
          kind: ConvertIssueKind.MissingDefinitionProperty,
          message: 'ElectionName is missing',
          property: 'AVSInterface > AccuvoteHeaderInfo > ElectionName',
        },
      ],
    });
  }

  const townName =
    accuvoteHeaderInfo?.getElementsByTagName('TownName')[0]?.textContent;
  if (typeof townName !== 'string') {
    return err({
      issues: [
        {
          kind: ConvertIssueKind.MissingDefinitionProperty,
          message: 'TownName is missing',
          property: 'AVSInterface > AccuvoteHeaderInfo > TownName',
        },
      ],
    });
  }

  const townId =
    accuvoteHeaderInfo?.getElementsByTagName('TownID')[0]?.textContent;
  if (typeof townId !== 'string') {
    return err({
      issues: [
        {
          kind: ConvertIssueKind.MissingDefinitionProperty,
          message: 'TownID is missing',
          property: 'AVSInterface > AccuvoteHeaderInfo > TownID',
        },
      ],
    });
  }

  const rawDate =
    accuvoteHeaderInfo?.getElementsByTagName('ElectionDate')[0]?.textContent;
  if (typeof rawDate !== 'string') {
    return err({
      issues: [
        {
          kind: ConvertIssueKind.MissingDefinitionProperty,
          message: 'ElectionDate is missing',
          property: 'AVSInterface > AccuvoteHeaderInfo > ElectionDate',
        },
      ],
    });
  }

  const dateFormats = ['M/d/yyyy HH:mm:ss', 'M/dd/yyyy'];
  const parsedDate = dateFormats
    .map((format) =>
      DateTime.fromFormat(rawDate.trim(), format, {
        locale: 'en-US',
        zone: 'America/New_York',
      })
    )
    .find((date) => date.isValid);
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

  const rawPrecinctId =
    root.getElementsByTagName('PrecinctID')[0]?.textContent?.trim() ||
    undefined;
  const cleanedPrecinctId = rawPrecinctId?.replace(/[^-_\w]/g, '');
  const precinctId = cleanedPrecinctId
    ? `town-id-${townId}-precinct-id-${cleanedPrecinctId}`
    : `town-id-${townId}-precinct`;

  const rawDistrictId = `town-id-${townId}-district`;
  const districtIdResult = safeParse(DistrictIdSchema, rawDistrictId);
  if (districtIdResult.isErr()) {
    return err({
      issues: [
        {
          kind: ConvertIssueKind.InvalidDistrictId,
          message: `Invalid district ID "${rawDistrictId}": ${
            districtIdResult.err().message
          }`,
          invalidDistrictId: rawDistrictId,
        },
      ],
    });
  }
  const districtId = districtIdResult.ok();

  const ballotSize = root.getElementsByTagName('BallotSize')[0]?.textContent;
  if (typeof ballotSize !== 'string') {
    return err({
      issues: [
        {
          kind: ConvertIssueKind.MissingDefinitionProperty,
          message: 'BallotSize is missing',
          property: 'AVSInterface > AccuvoteHeaderInfo > BallotSize',
        },
      ],
    });
  }
  let paperSize: BallotPaperSize;
  switch (ballotSize) {
    case '8.5X11':
      paperSize = BallotPaperSize.Letter;
      break;

    case '8.5X14':
      paperSize = BallotPaperSize.Legal;
      break;

    default:
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

  const electionPartyName = root
    .getElementsByTagName('PartyName')[0]
    ?.textContent?.trim();
  const electionParty: Party | undefined = electionPartyName
    ? {
        id: unsafeParse(PartyIdSchema, makeId(electionPartyName)),
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
  const optionMetadataByCandidateElement = new Map<
    Element,
    | Omit<GridPositionOption, 'row' | 'column' | 'sheetNumber' | 'side'>
    | Omit<
        GridPositionWriteIn,
        'row' | 'column' | 'sheetNumber' | 'side' | 'writeInArea'
      >
  >();

  for (const contestElement of Array.from(
    root.getElementsByTagName('Candidates')
  )) {
    const officeNameElement =
      contestElement.getElementsByTagName('OfficeName')[0];
    const officeName =
      officeNameElement?.getElementsByTagName('Name')[0]?.textContent;
    if (typeof officeName !== 'string') {
      return err({
        issues: [
          {
            kind: ConvertIssueKind.MissingDefinitionProperty,
            message: 'OfficeName is missing',
            property: 'AVSInterface > Candidates > OfficeName > Name',
          },
        ],
      });
    }
    const contestId = makeId(
      `${officeName}${electionPartyName ? `-${electionPartyName}` : ''}`
    );

    const winnerNote =
      officeNameElement?.getElementsByTagName('WinnerNote')[0]?.textContent;
    const seats =
      safeParseNumber(
        winnerNote?.match(/Vote for not more than (\d+)/)?.[1]
      ).ok() ??
      safeParseNumber(winnerNote?.match(/Vote for up to (\d+)/)?.[1]).ok() ??
      1;

    const [writeInElements, candidateElements] = iter(
      Array.from(contestElement.getElementsByTagName('CandidateName'))
    ).partition(
      (candidateElement) =>
        candidateElement.getElementsByTagName('WriteIn')[0]?.textContent ===
          'True' ||
        candidateElement.getElementsByTagName('Name')[0]?.textContent ===
          'Write-In'
    );

    const candidates: Candidate[] = [];
    for (const [i, candidateElement] of candidateElements.entries()) {
      const candidateName =
        candidateElement.getElementsByTagName('Name')[0]?.textContent;
      if (typeof candidateName !== 'string') {
        return err({
          issues: [
            {
              kind: ConvertIssueKind.MissingDefinitionProperty,
              message: `Name is missing in candidate ${i + 1} of ${officeName}`,
              property: 'AVSInterface > Candidates > CandidateName > Name',
            },
          ],
        });
      }

      let party: Party | undefined;
      const partyName =
        candidateElement?.getElementsByTagName('Party')[0]?.textContent;
      if (partyName) {
        party = parties.get(partyName);
        if (!party) {
          const partyId = makeId(partyName);
          party = {
            id: unsafeParse(PartyIdSchema, partyId),
            name: partyName,
            fullName: partyName,
            abbrev: partyName,
          };
          parties.set(partyName, party);
        }
      }

      const candidateId = makeId(candidateName);
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
                message: `Party is missing in candidate "${candidateName}" of office "${officeName}", required for multi-party endorsement`,
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

      optionMetadataByCandidateElement.set(candidateElement, {
        type: 'option',
        contestId,
        optionId: candidateId,
      });
    }

    // From the XML we've seen, write-ins are sometimes listed in reverse of the
    // order they appear on the ballot. In order to make sure the write-in
    // options we create have grid layout coordinates in ballot order, we sort
    // the write-ins here.
    const writeInElementsInBallotOrder = [...writeInElements].sort(
      (writeInA, writeInB) =>
        safeParseNumber(
          writeInA.getElementsByTagName('OY')[0]?.textContent
        ).assertOk('Write-in element has unparseable OY') -
        safeParseNumber(
          writeInB.getElementsByTagName('OY')[0]?.textContent
        ).assertOk('Write-in element has unparseable OY')
    );
    for (const [i, writeInElement] of writeInElementsInBallotOrder.entries()) {
      optionMetadataByCandidateElement.set(writeInElement, {
        type: 'write-in',
        contestId,
        writeInIndex: i,
      });
    }

    contests.push({
      type: 'candidate',
      id: contestId,
      title: officeName,
      districtId,
      seats,
      allowWriteIns: writeInElements.length > 0,
      candidates,
      partyId: electionParty?.id,
    });
  }

  const issues: ConvertIssue[] = [];
  const ballotPaperInfoElement =
    root.getElementsByTagName('BallotPaperInfo')[0];

  if (ballotPaperInfoElement) {
    const questionsElement =
      ballotPaperInfoElement.getElementsByTagName('Questions')[0];

    if (questionsElement) {
      const questionsTextContent = questionsElement.textContent;

      if (typeof questionsTextContent !== 'string') {
        issues.push({
          kind: ConvertIssueKind.MissingDefinitionProperty,
          message: 'Questions data is invalid',
          property: 'AVSInterface > BallotPaperInfo > Questions',
        });
      } else {
        const questionsDecoded = decodeHtmlEntities(questionsTextContent);
        const parseConstitutionalQuestionsResult =
          parseConstitutionalQuestions(questionsDecoded);
        debug('questions decoded: %o', parseConstitutionalQuestionsResult);

        if (parseConstitutionalQuestionsResult.isErr()) {
          issues.push({
            kind: ConvertIssueKind.ConstitutionalQuestionError,
            message: parseConstitutionalQuestionsResult.err().message,
            error: parseConstitutionalQuestionsResult.err(),
          });
        } else {
          const parsedConstitutionalQuestions =
            parseConstitutionalQuestionsResult.ok();
          for (const [
            i,
            question,
          ] of parsedConstitutionalQuestions.questions.entries()) {
            const contestTitle = `Constitutional Amendment Question #${i + 1}`;
            const contestId = makeId(question.title);
            contests.push({
              type: 'yesno',
              id: contestId,
              title: contestTitle,
              description: question.title,
              districtId,
              yesOption: {
                id: `${contestId}-option-yes`,
                label: 'Yes',
              },
              noOption: {
                id: `${contestId}-option-no`,
                label: 'No',
              },
            });
          }
        }
      }
    }
  }

  const definitionGrid = readGridFromElectionDefinition(root);

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
    gridLayouts: [
      {
        ballotStyleId: 'default',
        // hardcoded for NH state elections
        optionBoundsFromTargetMark: {
          left: 5,
          top: 1,
          right: 1,
          bottom: 1,
        },
        gridPositions: definitionGrid.map(({ element, column, row }) => {
          const metadata = optionMetadataByCandidateElement.get(element);
          assert(metadata, `metadata missing for column=${column} row=${row}`);
          return metadata.type === 'option'
            ? {
                type: 'option',
                sheetNumber: 1,
                side: 'front',
                column,
                row,
                contestId: metadata.contestId,
                optionId: metadata.optionId,
              }
            : {
                type: 'write-in',
                sheetNumber: 1,
                side: 'front',
                column,
                row,
                contestId: metadata.contestId,
                writeInIndex: metadata.writeInIndex,
                // We'll compute the actual write-in area later once we have the
                // bubble position
                writeInArea: {
                  x: -1,
                  y: -1,
                  width: -1,
                  height: -1,
                },
              };
        }),
      },
    ],
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
    result: parseElectionResult.ok(),
    issues,
  });
}
