import { safeParseNumber } from '@votingworks/types';
import { readFileSync } from 'node:fs';

// NH's ballot-style drops come in two interchangeable serializations of the
// same AVSInterface structure: a JSON export and an XML export. The XML is a
// rigid, attribute-free, entity-free tree (one element per line, leaf text
// only), so a small targeted extractor is more robust here than a general XML
// parser -- and it lets us emit exactly the object shape the JSON export
// produces, which `NhBallotStyleSchema` already validates.

interface XmlOfficeName {
  Name: string;
  Pronunciation: string;
  CX: number;
  CY: number;
  WinnerNote: string;
}

interface XmlCandidateName {
  Name: string;
  Pronunciation: string;
  CX: number;
  CY: number;
  OX: number;
  OY: number;
  City: string;
  State: string;
}

interface XmlWriteIn {
  OX: number;
  OY: number;
  City: string;
  State: string;
}

interface XmlContest {
  OfficeName: XmlOfficeName;
  // Single occurrence collapses to an object, multiple to an array, matching
  // the JSON export (and the schema's `union([Schema, array(Schema)])`).
  CandidateName?: XmlCandidateName | XmlCandidateName[];
  WriteIn: XmlWriteIn | XmlWriteIn[];
}

interface XmlHeaderInfo {
  ElectionDate: string;
  ElectionName: string;
  TownName: string;
  // Numeric wards are emitted as numbers so downstream labels read "Ward 1",
  // not "Ward 01" (the XML zero-pads); unwarded towns keep the empty string.
  WardName: string | number;
  PartyName: string;
  // eslint-disable-next-line vx/gts-identifiers
  TownID: string;
  // eslint-disable-next-line vx/gts-identifiers
  PrecinctID: string;
  // eslint-disable-next-line vx/gts-identifiers
  ElectionID: string;
  BallotType: string;
  BallotSize: string;
}

interface XmlNhBallotStyle {
  fileType: string;
  version: string;
  encoding: string;
  // eslint-disable-next-line vx/gts-identifiers
  AVSInterface: {
    HeaderInfo: XmlHeaderInfo;
    Candidates: XmlContest[];
  };
}

function leafText(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match === null ? undefined : match[1];
}

function requireNumber(block: string, tag: string): number {
  const text = leafText(block, tag);
  if (text === undefined) {
    throw new Error(`missing numeric field <${tag}>`);
  }
  const parsed = safeParseNumber(text);
  if (parsed.isErr()) {
    throw new Error(`non-numeric <${tag}>: "${text}"`);
  }
  return parsed.ok();
}

function optionalString(block: string, tag: string): string {
  return leafText(block, tag) ?? '';
}

function childBlocks(xml: string, tag: string): string[] {
  return [
    ...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g')),
  ].map((match) => match[1]);
}

/**
 * Parses an NH AVSInterface XML ballot-style export into the same object shape
 * as the JSON export, ready for `NhBallotStyleSchema`.
 */
export function parseNhBallotStyleXml(xml: string): XmlNhBallotStyle {
  const header = childBlocks(xml, 'HeaderInfo')[0];
  const wardRaw = optionalString(header, 'WardName');
  const wardName: string | number =
    wardRaw === ''
      ? ''
      : /^\d+$/.test(wardRaw)
      ? safeParseNumber(wardRaw).unsafeUnwrap()
      : wardRaw;

  const candidates: XmlContest[] = childBlocks(xml, 'Candidates').map(
    (block) => {
      const officeBlock = childBlocks(block, 'OfficeName')[0];
      const officeName: XmlOfficeName = {
        Name: optionalString(officeBlock, 'Name'),
        Pronunciation: optionalString(officeBlock, 'Pronunciation'),
        CX: requireNumber(officeBlock, 'CX'),
        CY: requireNumber(officeBlock, 'CY'),
        WinnerNote: optionalString(officeBlock, 'WinnerNote'),
      };
      const candidateNames: XmlCandidateName[] = childBlocks(
        block,
        'CandidateName'
      ).map((candidate) => ({
        Name: optionalString(candidate, 'Name'),
        Pronunciation: optionalString(candidate, 'Pronunciation'),
        CX: requireNumber(candidate, 'CX'),
        CY: requireNumber(candidate, 'CY'),
        OX: requireNumber(candidate, 'OX'),
        OY: requireNumber(candidate, 'OY'),
        City: optionalString(candidate, 'City'),
        State: optionalString(candidate, 'State'),
      }));
      const writeIns: XmlWriteIn[] = childBlocks(block, 'WriteIn').map(
        (writeIn) => ({
          OX: requireNumber(writeIn, 'OX'),
          OY: requireNumber(writeIn, 'OY'),
          City: optionalString(writeIn, 'City'),
          State: optionalString(writeIn, 'State'),
        })
      );
      return {
        OfficeName: officeName,
        ...(candidateNames.length === 1
          ? { CandidateName: candidateNames[0] }
          : candidateNames.length > 1
          ? { CandidateName: candidateNames }
          : {}),
        WriteIn: writeIns.length === 1 ? writeIns[0] : writeIns,
      };
    }
  );

  return {
    fileType: 'JSON',
    version: '1.0',
    encoding: 'UTF-8',
    // eslint-disable-next-line vx/gts-identifiers
    AVSInterface: {
      HeaderInfo: {
        ElectionDate: optionalString(header, 'ElectionDate'),
        ElectionName: optionalString(header, 'ElectionName'),
        TownName: optionalString(header, 'TownName'),
        WardName: wardName,
        PartyName: optionalString(header, 'PartyName'),
        // eslint-disable-next-line vx/gts-identifiers
        TownID: optionalString(header, 'TownID'),
        // eslint-disable-next-line vx/gts-identifiers
        PrecinctID: optionalString(header, 'PrecinctID'),
        // eslint-disable-next-line vx/gts-identifiers
        ElectionID: optionalString(header, 'ElectionID'),
        BallotType: optionalString(header, 'BallotType'),
        BallotSize: optionalString(header, 'BallotSize'),
      },
      Candidates: candidates,
    },
  };
}

/**
 * Reads a ballot-style file in either serialization (`.xml` or `.json`) into
 * the raw object shape for `NhBallotStyleSchema.parse`.
 */
export function readNhBallotStyleFile(path: string): unknown {
  const text = readFileSync(path, 'utf-8');
  return path.endsWith('.xml') ? parseNhBallotStyleXml(text) : JSON.parse(text);
}
