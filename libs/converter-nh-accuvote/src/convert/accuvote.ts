import {
  assert,
  err,
  ok,
  Optional,
  Result,
  resultBlock,
} from '@votingworks/basics';
import { safeParseNumber } from '@votingworks/types';
import { decode as decodeHtmlEntities } from 'he';
import { ConvertIssue, ConvertIssueKind } from './types';

/**
 * `AVSInterface` element data.
 */
export interface AvsInterface {
  accuvoteHeaderInfo: AccuvoteHeaderInfo;
  candidates: Candidates[];
  ballotPaperInfo?: BallotPaperInfo;
}

/**
 * `AccuvoteHeaderInfo` element data.
 */
export interface AccuvoteHeaderInfo {
  electionDate: string;
  electionName: string;
  townName: string;
  townId: string;
  partyName?: string;
  precinctId?: string;
  electionId: string;
  ballotType?: string;
  ballotSize: string;
}

/**
 * `Candidates` element data.
 */
export interface Candidates {
  officeName: OfficeName;
  candidateNames: CandidateName[];
}

/**
 * `OfficeName` element data.
 */
export interface OfficeName {
  name: string;
  winnerNote?: string;
  x: number;
  y: number;
}

/**
 * `CandidateName` element data.
 */
export interface CandidateName {
  name: string;
  pronunciation?: string;
  party?: string;
  writeIn?: boolean;
  cx: number;
  cy: number;
  ox: number;
  oy: number;
}

/**
 * `BallotPaperInfo` element data.
 */
export interface BallotPaperInfo {
  questions: string;
}

function getOptionalChild(
  element: Element,
  tagName: string
): Optional<Element> {
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === 1 && child.nodeName === tagName) {
      return child as Element;
    }
  }
}

function getOptionalChildText(
  element: Element,
  tagName: string
): Optional<string> {
  return getOptionalChild(element, tagName)?.textContent?.trim();
}

function getRequiredChild(
  element: Element,
  tagName: string
): Result<Element, ConvertIssue[]> {
  const child = getOptionalChild(element, tagName);
  if (!child) {
    return err([
      {
        kind: ConvertIssueKind.MissingDefinitionProperty,
        property: tagName,
        message: `missing required child element: ${element.tagName} → ${tagName}`,
      },
    ]);
  }
  return ok(child);
}

function getRequiredChildText(
  element: Element,
  tagName: string
): Result<string, ConvertIssue[]> {
  return resultBlock((bail) => {
    const child = getRequiredChild(element, tagName).okOrElse(bail);

    return (
      child.textContent?.trim() ||
      bail([
        {
          kind: ConvertIssueKind.MissingDefinitionProperty,
          property: tagName,
          message: `missing required property value: ${element.tagName} → ${tagName}`,
        },
      ])
    );
  });
}

function getRequiredChildNumericValue(
  element: Element,
  tagName: string
): Result<number, ConvertIssue[]> {
  return resultBlock((bail) => {
    const text = getRequiredChildText(element, tagName).okOrElse(bail);
    const parseResult = safeParseNumber(text);

    if (parseResult.isErr()) {
      return err([
        {
          kind: ConvertIssueKind.ElectionValidationFailed,
          validationError: parseResult.err() as Error,
          message: `Unable to parse value of property: '${tagName}'`,
        },
      ]);
    }

    return parseResult.ok();
  });
}

function getChildren(element: Element, tagName: string): Element[] {
  const children: Element[] = [];
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === 1 && child.nodeName === tagName) {
      children.push(child as Element);
    }
  }
  return children;
}

function parseAccuvoteHeaderInfoElement(
  element: Element
): Result<AccuvoteHeaderInfo, ConvertIssue[]> {
  return resultBlock((bail) => {
    return {
      electionDate: getRequiredChildText(element, 'ElectionDate').okOrElse(
        bail
      ),
      electionName: getRequiredChildText(element, 'ElectionName').okOrElse(
        bail
      ),
      townName: getRequiredChildText(element, 'TownName').okOrElse(bail),
      partyName: getOptionalChildText(element, 'PartyName'),
      townId: getRequiredChildText(element, 'TownID').okOrElse(bail),
      precinctId: getOptionalChildText(element, 'PrecinctID'),
      electionId: getRequiredChildText(element, 'ElectionID').okOrElse(bail),
      ballotType: getOptionalChildText(element, 'BallotType'),
      ballotSize: getRequiredChildText(element, 'BallotSize').okOrElse(bail),
    };
  });
}

function parseOfficeNameElement(
  element: Element
): Result<OfficeName, ConvertIssue[]> {
  return resultBlock((bail) => {
    return {
      name: getRequiredChildText(element, 'Name').okOrElse(bail),
      winnerNote: getOptionalChildText(element, 'WinnerNote'),
      x: getRequiredChildNumericValue(element, 'X').okOrElse(bail),
      y: getRequiredChildNumericValue(element, 'Y').okOrElse(bail),
    };
  });
}

function parseCandidateNameElement(
  element: Element
): Result<CandidateName, ConvertIssue[]> {
  return resultBlock((bail) => {
    const name = getRequiredChildText(element, 'Name').okOrElse(bail);
    const writeInPropertyValue = getOptionalChildText(element, 'WriteIn');
    return {
      name,
      pronunciation: getOptionalChildText(element, 'Pronunciation'),
      party: getOptionalChildText(element, 'Party'),
      writeIn: writeInPropertyValue
        ? writeInPropertyValue.toLowerCase() === 'true'
        : name === 'Write-In' || undefined,
      cx: getRequiredChildNumericValue(element, 'CX').okOrElse(bail),
      cy: getRequiredChildNumericValue(element, 'CY').okOrElse(bail),
      ox: getRequiredChildNumericValue(element, 'OX').okOrElse(bail),
      oy: getRequiredChildNumericValue(element, 'OY').okOrElse(bail),
    };
  });
}

function parseCandidatesElement(
  element: Element
): Result<Candidates, ConvertIssue[]> {
  return resultBlock((bail) => {
    return {
      officeName: parseOfficeNameElement(
        getRequiredChild(element, 'OfficeName').okOrElse(bail)
      ).okOrElse(bail),
      candidateNames: getChildren(element, 'CandidateName').map(
        (candidateName) =>
          parseCandidateNameElement(candidateName).okOrElse(bail)
      ),
    };
  });
}

/**
 * Parses the AccuVote format XML.
 */
export function parseXml(root: Element): Result<AvsInterface, ConvertIssue[]> {
  assert(root.tagName === 'AVSInterface');

  return resultBlock((bail) => {
    const accuvoteHeaderInfoElement = getRequiredChild(
      root,
      'AccuvoteHeaderInfo'
    ).okOrElse(bail);
    const ballotPaperInfo = getOptionalChild(root, 'BallotPaperInfo');
    const questions = ballotPaperInfo
      ? getOptionalChildText(ballotPaperInfo, 'Questions')
      : undefined;
    const avsInterface: AvsInterface = {
      accuvoteHeaderInfo: parseAccuvoteHeaderInfoElement(
        accuvoteHeaderInfoElement
      ).okOrElse(bail),
      candidates: getChildren(root, 'Candidates').map((candidatesElement) =>
        parseCandidatesElement(candidatesElement).okOrElse(bail)
      ),
      ballotPaperInfo: questions
        ? { questions: decodeHtmlEntities(questions) }
        : undefined,
    };

    return avsInterface;
  });
}
