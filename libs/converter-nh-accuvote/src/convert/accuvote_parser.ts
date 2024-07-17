import { err, ok, Optional, Result, resultBlock } from '@votingworks/basics';
import { safeParseNumber } from '@votingworks/types';
import { decode as decodeHtmlEntities } from 'he';
import {
  ConstitutionalQuestion,
  parseConstitutionalQuestions,
} from './parse_constitutional_questions';
import { ConvertIssue, ConvertIssueKind } from './types';

/**
 * Finds the first child element of `element` whose `nodeName` is `propertyName`.
 *
 * @example
 *
 * ```ts
 * // assume the following XML:
 * //   <AccuvoteHeaderInfo>
 * //     <ElectionID>123</ElectionID>
 * //   </AccuvoteHeaderInfo>
 *
 * const electionIdElement = getOptionalPropertyElement(
 *   accuvoteHeaderInfoElement,
 *   'ElectionID'
 * );
 *
 * assert(electionIdElement?.textContent === '123');
 *
 * const nonExistentElement = getOptionalPropertyElement(
 *   accuvoteHeaderInfoElement,
 *   'NotARealProperty'
 * );
 * assert(nonExistentElement === undefined);
 * ```
 */
function getOptionalPropertyElement(
  element: Element,
  propertyName: string
): Optional<Element> {
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeName === propertyName) {
      return child as Element;
    }
  }
}

/**
 * Finds the first child element of `element` whose `nodeName` is `propertyName`,
 * or returns an error if the property is missing.
 *
 * @example
 *
 * ```ts
 * // assume the following XML:
 * //   <AccuvoteHeaderInfo>
 * //     <ElectionID>123</ElectionID>
 * //   </AccuvoteHeaderInfo>
 *
 * const electionIdElement = getRequiredPropertyElement(
 *   accuvoteHeaderInfoElement,
 *   'ElectionID'
 * );
 *
 * assert(electionIdElement.unsafeUnwrap().textContent === '123');
 *
 * const nonExistentElement = getRequiredPropertyElement(
 *   accuvoteHeaderInfoElement,
 *   'NotARealProperty'
 * );
 *
 * assert(nonExistentElement.isErr());
 * ```
 */
function getRequiredPropertyElement(
  element: Element,
  propertyName: string
): Result<Element, ConvertIssue[]> {
  const propertyElement = getOptionalPropertyElement(element, propertyName);

  if (!propertyElement) {
    return err([
      {
        kind: ConvertIssueKind.MissingDefinitionProperty,
        message: `${propertyName} is missing`,
        property: propertyName,
      },
    ]);
  }

  return ok(propertyElement);
}

/**
 * Extracts the text content of an optional property from an element.
 *
 *
 * @example
 *
 * ```ts
 * // assume the following XML:
 * //   <AccuvoteHeaderInfo>
 * //     <ElectionID>123</ElectionID>
 * //   </AccuvoteHeaderInfo>
 *
 * const electionId = extractOptionalPropertyText(
 *   accuvoteHeaderInfoElement,
 *   'ElectionID'
 * );
 *
 * assert(electionId === '123');
 *
 * const nonExistentProperty = extractOptionalPropertyText(
 *   accuvoteHeaderInfoElement,
 *   'NotARealProperty'
 * );
 *
 * assert(nonExistentProperty === undefined);
 * ```
 */
function extractOptionalPropertyText(
  element: Element,
  propertyName: string
): Optional<string> {
  const propertyElement = getOptionalPropertyElement(element, propertyName);
  const text = propertyElement?.textContent?.trim();
  return text || undefined;
}

/**
 * Extracts the text content of a required property from an element, returning
 * an error if the property is missing.
 *
 * @example
 *
 * ```ts
 * // assume the following XML:
 * //   <AccuvoteHeaderInfo>
 * //     <ElectionID>123</ElectionID>
 * //   </AccuvoteHeaderInfo>
 *
 * const electionId = extractRequiredPropertyText(
 *   accuvoteHeaderInfoElement,
 *   'ElectionID'
 * );
 *
 * assert(electionId.unsafeUnwrap() === '123');
 *
 * const nonExistentProperty = extractRequiredPropertyText(
 *   accuvoteHeaderInfoElement,
 *   'NotARealProperty'
 * );
 *
 * assert(nonExistentProperty.isErr());
 * ```
 */
function extractRequiredPropertyText(
  element: Element,
  propertyName: string
): Result<string, ConvertIssue[]> {
  const text = extractOptionalPropertyText(element, propertyName);

  if (!text) {
    return err([
      {
        kind: ConvertIssueKind.MissingDefinitionProperty,
        message: `${propertyName} is missing`,
        property: propertyName,
      },
    ]);
  }

  return ok(text);
}

/**
 * Parses the `AccuvoteHeaderInfo` element of an AccuVote format XML document.
 */
export function parseHeader(element: Element): Result<Header, ConvertIssue[]> {
  return resultBlock((fail) => {
    const electionId = extractRequiredPropertyText(
      element,
      'ElectionID'
    ).okOrElse(fail);
    const electionDate = extractRequiredPropertyText(
      element,
      'ElectionDate'
    ).okOrElse(fail);
    const electionName = extractRequiredPropertyText(
      element,
      'ElectionName'
    ).okOrElse(fail);
    const townName = extractRequiredPropertyText(element, 'TownName').okOrElse(
      fail
    );
    const partyName = extractOptionalPropertyText(element, 'PartyName');
    const townId = extractRequiredPropertyText(element, 'TownID').okOrElse(
      fail
    );
    const precinctId = extractOptionalPropertyText(element, 'PrecinctID');
    const ballotType = extractRequiredPropertyText(
      element,
      'BallotType'
    ).okOrElse(fail);
    const ballotSize = extractRequiredPropertyText(
      element,
      'BallotSize'
    ).okOrElse(fail);

    return ok({
      electionId,
      electionDate,
      electionName,
      townName,
      partyName,
      townId,
      precinctId,
      ballotType,
      ballotSize,
    });
  });
}

/**
 * Parses the `OfficeName` element of an AccuVote format XML document.
 */
export function parseContestOffice(
  element: Element
): Result<Office, ConvertIssue[]> {
  return resultBlock((fail) => {
    const name = extractRequiredPropertyText(element, 'Name').okOrElse(fail);
    const winnerNote = extractRequiredPropertyText(
      element,
      'WinnerNote'
    ).okOrElse(fail);

    return ok({ name, winnerNote });
  });
}

/**
 * Parses a single `CandidateName` element in an AccuVote format XML document.
 */
export function parseCandidate(
  candidateElement: Element
): Result<Candidate, ConvertIssue[]> {
  return resultBlock((fail) => {
    const name = extractRequiredPropertyText(candidateElement, 'Name').okOrElse(
      fail
    );
    const partyName = extractOptionalPropertyText(candidateElement, 'Party');
    const pronunciation = extractOptionalPropertyText(
      candidateElement,
      'Pronunciation'
    );
    const ovalX = safeParseNumber(
      extractRequiredPropertyText(candidateElement, 'OX').okOrElse(fail),
      { min: 0 }
    ).ok();

    if (ovalX === undefined) {
      return err([
        {
          kind: ConvertIssueKind.MissingDefinitionProperty,
          message: 'OX is missing or invalid',
          property: 'OX',
        },
      ]);
    }

    const ovalY = safeParseNumber(
      extractRequiredPropertyText(candidateElement, 'OY').okOrElse(fail),
      { min: 0 }
    ).ok();

    if (ovalY === undefined) {
      return err([
        {
          kind: ConvertIssueKind.MissingDefinitionProperty,
          message: 'OY is missing or invalid',
          property: 'OY',
        },
      ]);
    }

    const isWriteIn =
      extractOptionalPropertyText(candidateElement, 'WriteIn') === 'True' ||
      name.toLowerCase() === 'write-in';

    return ok({
      name,
      partyName,
      pronunciation,
      ovalX,
      ovalY,
      isWriteIn,
    });
  });
}

/**
 * Parses the `Candidates` elements of an AccuVote format XML document.
 */
export function parseCandidates(
  element: Element
): Result<Candidate[], ConvertIssue[]> {
  return resultBlock((fail) => {
    const candidates: Candidate[] = [];

    for (const node of Array.from(element.childNodes)) {
      if (node.nodeName === 'CandidateName') {
        candidates.push(parseCandidate(node as Element).okOrElse(fail));
      }
    }

    return candidates;
  });
}

/**
 * Parses a single `Candidates` element contest in an AccuVote format XML
 * document.
 */
export function parseCandidateContest(
  element: Element
): Result<CandidateContest, ConvertIssue[]> {
  return resultBlock((fail) => {
    const officeNameElement = getRequiredPropertyElement(
      element,
      'OfficeName'
    ).okOrElse(fail);
    const office = parseContestOffice(officeNameElement).okOrElse(fail);
    const candidates = parseCandidates(element).okOrElse(fail);
    return ok({ office, candidates });
  });
}

/**
 * Parses the `Candidates` elements of an AccuVote format XML document.
 */
export function parseCandidateContests(
  element: Element
): Result<CandidateContest[], ConvertIssue[]> {
  return resultBlock((fail) => {
    const contests: CandidateContest[] = [];

    for (const node of Array.from(element.childNodes)) {
      if (node.nodeName === 'Candidates') {
        contests.push(parseCandidateContest(node as Element).okOrElse(fail));
      }
    }

    return contests;
  });
}

/**
 * Parses the `Questions` elements of an AccuVote format XML document.
 */
export function parseConstitutionalQuestionElements(
  root: Element
): Result<ConstitutionalQuestion[], ConvertIssue[]> {
  const issues: ConvertIssue[] = [];
  const ballotPaperInfoElement = getOptionalPropertyElement(
    root,
    'BallotPaperInfo'
  );

  if (ballotPaperInfoElement) {
    const questionsTextContent = extractOptionalPropertyText(
      ballotPaperInfoElement,
      'Questions'
    );

    if (questionsTextContent) {
      const questionsDecoded = decodeHtmlEntities(questionsTextContent);
      const parseConstitutionalQuestionsResult =
        parseConstitutionalQuestions(questionsDecoded);

      if (parseConstitutionalQuestionsResult.isErr()) {
        issues.push({
          kind: ConvertIssueKind.ConstitutionalQuestionError,
          message: parseConstitutionalQuestionsResult.err().message,
          error: parseConstitutionalQuestionsResult.err(),
        });
      } else {
        return ok(parseConstitutionalQuestionsResult.ok().questions);
      }
    }
  }

  return issues.length ? err(issues) : ok([]);
}

/**
 * Parses an AccuVote format XML document.
 */
export function parseAccuvoteConfig(
  root: Element
): Result<BallotCardConfiguration, ConvertIssue[]> {
  return resultBlock((fail) => {
    const headerElement = getRequiredPropertyElement(
      root,
      'AccuvoteHeaderInfo'
    ).okOrElse(fail);

    return ok({
      header: parseHeader(headerElement).okOrElse(fail),
      candidateContests: parseCandidateContests(root).okOrElse(fail),
      questions: parseConstitutionalQuestionElements(root).okOrElse(fail),
    });
  });
}

/**
 * Root element of an AccuVote format XML document, corresponds to the
 * `AVSInterface` element.
 */
export interface BallotCardConfiguration {
  header: Header;
  candidateContests: CandidateContest[];
  questions: ConstitutionalQuestion[];
}

/**
 * Ballot-level configuration header, corresponds to the `AccuvoteHeaderInfo`
 * element.
 */
export interface Header {
  electionId: string;
  electionDate: string;
  electionName: string;
  townName: string;
  partyName?: string;
  townId: string;
  precinctId?: string;
  ballotType: string;
  ballotSize: string;
}

/**
 * A contest in an AccuVote format XML document.
 */
export type Contest = ConstitutionalQuestion | CandidateContest;

/**
 * Information about a candidate contest, corresponds to the `Candidates`
 * element.
 */
export interface CandidateContest {
  office: Office;
  candidates: Candidate[];
}

/**
 * Office-level configuration, corresponds to the `OfficeName` element.
 */
export interface Office {
  name: string;
  winnerNote: string;
}

/**
 * Information about a candidate, corresponds to the `CandidateName` element.
 */
export interface Candidate {
  name: string;
  partyName?: string;
  pronunciation?: string;
  ovalX: number;
  ovalY: number;
  isWriteIn: boolean;
}
