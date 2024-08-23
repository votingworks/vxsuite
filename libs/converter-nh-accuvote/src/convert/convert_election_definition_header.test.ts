import { typedAs } from '@votingworks/basics';
import {
  electionGridLayoutNewHampshireHudsonFixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
} from '@votingworks/fixtures';
import {
  BallotPaperSize,
  CandidateContest,
  PartyIdSchema,
  unsafeParse,
} from '@votingworks/types';
import { readFixtureDefinition } from '../../test/fixtures';
import * as accuvote from './accuvote';
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
    accuvote.parseXml(hudsonBallotCardDefinition).unsafeUnwrap()
  ).unsafeUnwrap();

  expect(header.result.election.ballotLayout.paperSize).toEqual(
    BallotPaperSize.Letter
  );
});

test('multi-party endorsement', () => {
  const nhTestBallotCardDefinition = readFixtureDefinition(
    electionGridLayoutNewHampshireTestBallotFixtures.definitionXml.asText()
  );

  expect(
    convertElectionDefinitionHeader(
      accuvote.parseXml(nhTestBallotCardDefinition).unsafeUnwrap()
    ).unsafeUnwrap().result.election.contests
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining(
        typedAs<Partial<CandidateContest>>({
          id: 'Sheriff-0f76c952',
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
  const nhTestBallotCardDefinition = readFixtureDefinition(
    electionGridLayoutNewHampshireTestBallotFixtures.definitionXml.asText()
  );

  const sheriffElement = Array.from(
    nhTestBallotCardDefinition.getElementsByTagName('Candidates')
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
      accuvote.parseXml(nhTestBallotCardDefinition).unsafeUnwrap()
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
