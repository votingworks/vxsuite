import {
  electionGridLayoutNewHampshireAmherstFixtures,
  electionGridLayoutNewHampshireHudsonFixtures,
} from '@votingworks/fixtures';
import {
  BallotPaperSize,
  CandidateContest,
  DistrictIdSchema,
  PartyIdSchema,
  YesNoContest,
  unsafeParse,
} from '@votingworks/types';
import { typedAs } from '@votingworks/basics';
import {
  readFixtureBallotCardDefinition,
  readFixtureDefinition,
} from '../../test/fixtures';
import { convertElectionDefinitionHeader } from './convert_election_definition_header';
import { ConvertIssue, ConvertIssueKind } from './types';

test('letter-size card definition', () => {
  const hudsonBallotCardDefinition = readFixtureDefinition(
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText()
  );

  hudsonBallotCardDefinition.getElementsByTagName(
    'BallotSize'
  )[0]!.textContent = '8.5X11';

  const header = convertElectionDefinitionHeader(
    hudsonBallotCardDefinition
  ).unsafeUnwrap();

  expect(header.election?.ballotLayout?.paperSize).toEqual(
    BallotPaperSize.Letter
  );
});

test('missing ElectionID', () => {
  const hudsonBallotCardDefinition = readFixtureDefinition(
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText()
  );

  const electionIdElement =
    hudsonBallotCardDefinition.getElementsByTagName('ElectionID')[0]!;
  electionIdElement.parentNode?.removeChild(electionIdElement);

  expect(
    convertElectionDefinitionHeader(
      hudsonBallotCardDefinition
    ).unsafeUnwrapErr().issues
  ).toEqual([
    typedAs<ConvertIssue>({
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message: 'ElectionID is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > ElectionID',
    }),
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
    convertElectionDefinitionHeader(
      hudsonBallotCardDefinition
    ).unsafeUnwrapErr().issues
  ).toEqual([
    typedAs<ConvertIssue>({
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message: 'ElectionName is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > ElectionName',
    }),
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
    convertElectionDefinitionHeader(
      hudsonBallotCardDefinition
    ).unsafeUnwrapErr().issues
  ).toEqual([
    typedAs<ConvertIssue>({
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message: 'TownName is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > TownName',
    }),
  ]);
});

test('missing TownID', () => {
  const hudsonBallotCardDefinition = readFixtureDefinition(
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText()
  );

  const townIdElement =
    hudsonBallotCardDefinition.getElementsByTagName('TownID')[0]!;
  townIdElement.parentNode?.removeChild(townIdElement);

  expect(
    convertElectionDefinitionHeader(
      hudsonBallotCardDefinition
    ).unsafeUnwrapErr().issues
  ).toEqual([
    typedAs<ConvertIssue>({
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message: 'TownID is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > TownID',
    }),
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
    convertElectionDefinitionHeader(
      hudsonBallotCardDefinition
    ).unsafeUnwrapErr().issues
  ).toEqual([
    typedAs<ConvertIssue>({
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message: 'ElectionDate is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > ElectionDate',
    }),
  ]);
});

test('missing PrecinctID', () => {
  const hudsonBallotCardDefinition = readFixtureDefinition(
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText()
  );

  const precinctIdElement =
    hudsonBallotCardDefinition.getElementsByTagName('PrecinctID')[0]!;
  precinctIdElement.parentNode?.removeChild(precinctIdElement);

  expect(
    convertElectionDefinitionHeader(
      hudsonBallotCardDefinition
    ).unsafeUnwrapErr().issues
  ).toEqual([
    typedAs<ConvertIssue>({
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message: 'PrecinctID is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > PrecinctID',
    }),
  ]);
});

test('multi-party endorsement', () => {
  const amherstBallotCardDefinition = readFixtureDefinition(
    electionGridLayoutNewHampshireAmherstFixtures.definitionXml.asText()
  );

  expect(
    convertElectionDefinitionHeader(amherstBallotCardDefinition).unsafeUnwrap()
      .election?.contests
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining(
        typedAs<Partial<CandidateContest>>({
          id: 'Sheriff-4243fe0b',
          title: 'Sheriff',
          candidates: [
            {
              id: 'Edward-Randolph-bf4c848a',
              name: 'Edward Randolph',
              partyIds: [
                unsafeParse(PartyIdSchema, 'Democratic-aea20adb'),
                unsafeParse(PartyIdSchema, 'Republican-f0167ce7'),
              ],
            },
          ],
        })
      ),
    ])
  );
});

test('missing Party on multi-party endorsement', () => {
  const amherstBallotCardDefinition = readFixtureDefinition(
    electionGridLayoutNewHampshireAmherstFixtures.definitionXml.asText()
  );

  const sheriffElement = Array.from(
    amherstBallotCardDefinition.getElementsByTagName('Candidates')
  ).find((candidates) => {
    const officeName = candidates
      .getElementsByTagName('OfficeName')[0]!
      .getElementsByTagName('Name')[0]!.textContent;
    return officeName === 'Sheriff';
  })!;
  const sheriffCandidateElements =
    sheriffElement.getElementsByTagName('CandidateName');
  // const sheriffCandidateFirstElement = sheriffCandidateElements[0]!;
  const sheriffCandidateSecondElement = sheriffCandidateElements[1]!;

  const sheriffCandidateSecondPartyElement =
    sheriffCandidateSecondElement.getElementsByTagName('Party')[0]!;
  sheriffCandidateSecondPartyElement.parentNode!.removeChild(
    sheriffCandidateSecondPartyElement
  );

  expect(
    convertElectionDefinitionHeader(
      amherstBallotCardDefinition
    ).unsafeUnwrapErr().issues
  ).toEqual([
    typedAs<ConvertIssue>({
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message:
        'Party is missing in candidate "Edward Randolph" of office "Sheriff", required for multi-party endorsement',
      property: 'AVSInterface > Candidates > CandidateName > Party',
    }),
  ]);
});

test('constitutional questions become yesno contests', async () => {
  const amherstBallotCardDefinition = readFixtureBallotCardDefinition(
    electionGridLayoutNewHampshireAmherstFixtures.definitionXml.asText(),
    await electionGridLayoutNewHampshireAmherstFixtures.templateFront.asImageData(),
    await electionGridLayoutNewHampshireAmherstFixtures.templateBack.asImageData()
  );
  const converted = convertElectionDefinitionHeader(
    amherstBallotCardDefinition.definition
  ).unsafeUnwrap();

  expect(
    converted.election?.contests.filter((c) => c.type === 'yesno')
  ).toEqual(
    typedAs<YesNoContest[]>([
      {
        type: 'yesno',
        id: 'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc',
        title: 'Constitutional Amendment Question #1',
        description:
          'Shall there be a convention to amend or revise the constitution?',
        districtId: unsafeParse(DistrictIdSchema, 'town-id-00701-precinct-id-'),
      },
    ])
  );
});
