import { electionGridLayoutNewHampshireHudsonFixtures } from '@votingworks/fixtures';
import { readFixtureDefinition } from '../../test/fixtures';
import * as accuvote from './accuvote';
import { ConvertIssue, ConvertIssueKind } from './types';

test('missing TownID', () => {
  const hudsonBallotCardDefinition = readFixtureDefinition(
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText()
  );

  const townIdElement =
    hudsonBallotCardDefinition.getElementsByTagName('TownID')[0]!;
  townIdElement.parentNode?.removeChild(townIdElement);

  expect(
    accuvote.parseXml(hudsonBallotCardDefinition).unsafeUnwrapErr()
  ).toEqual<ConvertIssue[]>([
    {
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message: 'missing required child element: AccuvoteHeaderInfo → TownID',
      property: 'TownID',
    },
  ]);
});

test('missing ElectionID', () => {
  const hudsonBallotCardDefinition = readFixtureDefinition(
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText()
  );

  const electionIdElement =
    hudsonBallotCardDefinition.getElementsByTagName('ElectionID')[0]!;
  electionIdElement.parentNode?.removeChild(electionIdElement);

  expect(
    accuvote.parseXml(hudsonBallotCardDefinition).unsafeUnwrapErr()
  ).toEqual<ConvertIssue[]>([
    {
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message:
        'missing required child element: AccuvoteHeaderInfo → ElectionID',
      property: 'ElectionID',
    },
  ]);
});

test('missing ElectionName', () => {
  const hudsonBallotCardDefinition = readFixtureDefinition(
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText()
  );

  const electionNameElement =
    hudsonBallotCardDefinition.getElementsByTagName('ElectionName')[0]!;
  electionNameElement.parentNode?.removeChild(electionNameElement);

  expect(
    accuvote.parseXml(hudsonBallotCardDefinition).unsafeUnwrapErr()
  ).toEqual<ConvertIssue[]>([
    {
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message:
        'missing required child element: AccuvoteHeaderInfo → ElectionName',
      property: 'ElectionName',
    },
  ]);
});

test('missing TownName', () => {
  const hudsonBallotCardDefinition = readFixtureDefinition(
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText()
  );

  const townNameElement =
    hudsonBallotCardDefinition.getElementsByTagName('TownName')[0]!;
  townNameElement.parentNode?.removeChild(townNameElement);

  expect(
    accuvote.parseXml(hudsonBallotCardDefinition).unsafeUnwrapErr()
  ).toEqual<ConvertIssue[]>([
    {
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message: 'missing required child element: AccuvoteHeaderInfo → TownName',
      property: 'TownName',
    },
  ]);
});

test('missing ElectionDate', () => {
  const hudsonBallotCardDefinition = readFixtureDefinition(
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText()
  );

  const electionDateElement =
    hudsonBallotCardDefinition.getElementsByTagName('ElectionDate')[0]!;
  electionDateElement.parentNode?.removeChild(electionDateElement);

  expect(
    accuvote.parseXml(hudsonBallotCardDefinition).unsafeUnwrapErr()
  ).toEqual<ConvertIssue[]>([
    {
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message:
        'missing required child element: AccuvoteHeaderInfo → ElectionDate',
      property: 'ElectionDate',
    },
  ]);
});
