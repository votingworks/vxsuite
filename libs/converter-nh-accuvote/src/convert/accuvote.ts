import {
  assert,
  assertDefined,
  err,
  ok,
  Optional,
  Result,
  resultBlock,
} from '@votingworks/basics';
import { safeParseNumber } from '@votingworks/types';
import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom';
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
  const text = getOptionalChild(element, tagName)?.textContent?.trim();
  return text === 'undefined' || text === 'null' ? undefined : text;
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

function unparseAccuvoteHeaderInfoElement(
  accuvoteHeaderInfo: AccuvoteHeaderInfo,
  document: Document
): Element {
  const element = document.createElement('AccuvoteHeaderInfo');
  element.appendChild(document.createElement('ElectionDate')).textContent =
    accuvoteHeaderInfo.electionDate;
  element.appendChild(document.createElement('ElectionName')).textContent =
    accuvoteHeaderInfo.electionName;
  element.appendChild(document.createElement('TownName')).textContent =
    accuvoteHeaderInfo.townName;
  if (accuvoteHeaderInfo.partyName) {
    element.appendChild(document.createElement('PartyName')).textContent =
      accuvoteHeaderInfo.partyName;
  }
  if (accuvoteHeaderInfo.precinctId) {
    element.appendChild(document.createElement('PrecinctID')).textContent =
      accuvoteHeaderInfo.precinctId;
  }
  element.appendChild(document.createElement('TownID')).textContent =
    accuvoteHeaderInfo.townId;
  element.appendChild(document.createElement('ElectionID')).textContent =
    accuvoteHeaderInfo.electionId;
  if (accuvoteHeaderInfo.ballotType) {
    element.appendChild(document.createElement('BallotType')).textContent =
      accuvoteHeaderInfo.ballotType;
  }
  element.appendChild(document.createElement('BallotSize')).textContent =
    accuvoteHeaderInfo.ballotSize;
  return element;
}

function unparseOfficeName(
  officeName: OfficeName,
  document: Document
): Element {
  const element = document.createElement('OfficeName');
  element.appendChild(document.createElement('Name')).textContent =
    officeName.name;
  if (officeName.winnerNote) {
    element.appendChild(document.createElement('WinnerNote')).textContent =
      officeName.winnerNote;
  }
  element.appendChild(document.createElement('X')).textContent =
    officeName.x.toString();
  element.appendChild(document.createElement('Y')).textContent =
    officeName.y.toString();
  return element;
}

const coordinateFormatter = new Intl.NumberFormat('en-US', {
  useGrouping: false,
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

function unparseCandidateName(
  candidateName: CandidateName,
  document: Document
): Element {
  const element = document.createElement('CandidateName');
  element.appendChild(document.createElement('Name')).textContent =
    candidateName.name;
  if (candidateName.pronunciation) {
    element.appendChild(document.createElement('Pronunciation')).textContent =
      candidateName.pronunciation;
  }
  if (candidateName.party) {
    element.appendChild(document.createElement('Party')).textContent =
      candidateName.party;
  }
  if (typeof candidateName.writeIn !== 'undefined') {
    element.appendChild(document.createElement('WriteIn')).textContent =
      candidateName.writeIn.toString();
  }
  element.appendChild(document.createElement('CX')).textContent =
    coordinateFormatter.format(candidateName.cx);
  element.appendChild(document.createElement('CY')).textContent =
    coordinateFormatter.format(candidateName.cy);
  element.appendChild(document.createElement('OX')).textContent =
    coordinateFormatter.format(candidateName.ox);
  element.appendChild(document.createElement('OY')).textContent =
    coordinateFormatter.format(candidateName.oy);
  return element;
}

function unparseCandidates(
  candidates: Candidates,
  document: Document
): Element {
  const element = document.createElement('Candidates');
  element.appendChild(unparseOfficeName(candidates.officeName, document));
  for (const candidate of candidates.candidateNames) {
    element.appendChild(unparseCandidateName(candidate, document));
  }
  return element;
}

function unparseBallotPaperInfo(
  ballotPaperInfo: BallotPaperInfo,
  document: Document
): Element {
  const element = document.createElement('BallotPaperInfo');
  element.appendChild(document.createElement('Questions')).textContent =
    ballotPaperInfo.questions;
  return element;
}

/**
 * Generates an XML document from an `AvsInterface` object.
 */
export function toDocument(avsInterface: AvsInterface): Document {
  const dom = new DOMImplementation();
  const document = dom.createDocument(null, 'AVSInterface', null);
  const documentElement = assertDefined(document.documentElement);
  const accuvoteHeaderInfoElement = unparseAccuvoteHeaderInfoElement(
    avsInterface.accuvoteHeaderInfo,
    document
  );
  documentElement.appendChild(accuvoteHeaderInfoElement);

  for (const candidates of avsInterface.candidates) {
    const candidatesElement = unparseCandidates(candidates, document);
    documentElement.appendChild(candidatesElement);
  }

  const { ballotPaperInfo } = avsInterface;
  if (ballotPaperInfo) {
    const ballotPaperInfoElement = unparseBallotPaperInfo(
      ballotPaperInfo,
      document
    );
    documentElement.appendChild(ballotPaperInfoElement);
  }

  return document;
}

/**
 * Generates an XML string from an `AvsInterface` object.
 */
export function toXml(avsInterface: AvsInterface): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(
    toDocument(avsInterface)
  )}`;
}
